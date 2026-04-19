// ============================================================
// calculateBalance — server-side recalculation (CommonJS)
// Same logic as src/lib/calculateBalance.js
// Used by create-checkout.js to prevent amount tampering
// ============================================================

function calculateBalance({ children, registrations, divisions, weeks, parent, settings }) {
    const isElrc = parent?.elrc_status === true;
  
    const siblingStartsAt = Number(settings?.sibling_discount_starts_at) || 2;
    const siblingCentsPerWeek = Number(settings?.sibling_discount_cents) || 0;
    const siblingElementaryOnly = settings?.sibling_discount_elementary_only ?? false;
    const minFloor = Number(settings?.minimum_weekly_price_cents) || 0;
  
    // Early bird: per-division fixed cents, only on full weeks, before deadline
    const earlyBirdDeadline = settings?.early_bird_deadline ? new Date(settings.early_bird_deadline) : null;
    const applyEarlyBird = earlyBirdDeadline && new Date() < earlyBirdDeadline;
  
    const divMap = Object.fromEntries(divisions.map((d) => [d.id, d]));
    const weekMap = Object.fromEntries(weeks.map((w) => [w.id, w]));
    const childMap = Object.fromEntries(children.map((c) => [c.id, c]));
  
    const registeredChildIds = [...new Set(registrations.map((r) => r.child_id))];
    const registeredChildCount = registeredChildIds.length;
  
    const childBreakdowns = [];
    let grandTotalCharges = 0;
    let grandTotalSibling = 0;
    let grandTotalEarlyBird = 0;
  
    for (const childId of registeredChildIds) {
      const child = childMap[childId];
      if (!child) continue;
  
      const childRegs = registrations.filter((r) => r.child_id === childId);
      const weekDetails = [];
      let childCharges = 0;
      let childSibling = 0;
      let childEarlyBird = 0;
  
      const primaryDivId = childRegs[0]?.division_id;
      const primaryDiv = divMap[primaryDivId];
      const isPreschool = (primaryDiv?.name || "").toLowerCase().includes("preschool");
      const isSiblingEligible =
        registeredChildCount >= siblingStartsAt &&
        siblingCentsPerWeek > 0 &&
        (!siblingElementaryOnly || !isPreschool);
  
      for (const reg of childRegs) {
        const div = divMap[reg.division_id];
        const wk = weekMap[reg.week_id];
        if (!div || !wk) continue;
  
        const divBasePrice = div.per_week_price || 0;
        const isPartial = wk.price_override_cents != null && wk.price_override_cents !== divBasePrice;
        const prorationRatio = divBasePrice > 0 ? (wk.price_override_cents ?? divBasePrice) / divBasePrice : 1;
  
        let basePrice;
        if (isElrc && div.elrc_weekly_price != null) {
          basePrice = isPartial
            ? Math.round(div.elrc_weekly_price * prorationRatio)
            : div.elrc_weekly_price;
        } else {
          basePrice = wk.price_override_cents ?? divBasePrice;
        }
  
        const sibDiscount = isSiblingEligible
          ? (isPartial ? Math.round(siblingCentsPerWeek * prorationRatio) : siblingCentsPerWeek)
          : 0;
  
        let earlyBird = 0;
        if (applyEarlyBird && !isPartial && div.early_bird_discount_cents) {
          earlyBird = div.early_bird_discount_cents;
        }
  
        const floor = isPartial ? Math.round(minFloor * prorationRatio) : minFloor;
        const weekTotal = Math.max(floor, basePrice - sibDiscount - earlyBird);
  
        const actualDiscount = basePrice - weekTotal;
        const actualSibling = Math.min(sibDiscount, actualDiscount);
        const actualEarlyBird = Math.min(earlyBird, actualDiscount - actualSibling);
  
        weekDetails.push({
          weekId: wk.id,
          registrationId: reg.id,
          weekName: wk.name || "Week",
          isPartial,
          basePrice,
          siblingDiscount: actualSibling,
          earlyBirdDiscount: actualEarlyBird,
          total: weekTotal,
        });
  
        childCharges += basePrice;
        childSibling += actualSibling;
        childEarlyBird += actualEarlyBird;
      }
  
      const divIds = [...new Set(childRegs.map((r) => r.division_id))];
      const divNames = divIds.map((id) => divMap[id]?.name).filter(Boolean);
  
      childBreakdowns.push({
        childId,
        childName: `${child.first_name} ${child.last_name}`,
        division: divNames.join(", "),
        isElrc: isElrc && divIds.some((id) => divMap[id]?.elrc_weekly_price != null),
        weeks: weekDetails,
        charges: childCharges,
        siblingDiscount: childSibling,
        earlyBirdDiscount: childEarlyBird,
        subtotal: weekDetails.reduce((sum, w) => sum + w.total, 0),
      });
  
      grandTotalCharges += childCharges;
      grandTotalSibling += childSibling;
      grandTotalEarlyBird += childEarlyBird;
    }
  
    const totalDiscounts = grandTotalSibling + grandTotalEarlyBird;
    const totalDue = grandTotalCharges - totalDiscounts;
  
    return {
      children: childBreakdowns,
      totalCharges: grandTotalCharges,
      discounts: {
        sibling: grandTotalSibling,
        earlyBird: grandTotalEarlyBird,
        total: totalDiscounts,
      },
      totalDue,
    };
  }
  
  module.exports = { calculateBalance };