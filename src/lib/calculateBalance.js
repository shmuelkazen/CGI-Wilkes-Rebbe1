// ============================================================
// calculateBalance — recalculates family charges on the fly
// Used by ParentDashboard for display + ledger sync
// ============================================================

/**
 * @param {Object} opts
 * @param {Array} opts.children       - children rows for this parent
 * @param {Array} opts.registrations  - active registrations (non-cancelled)
 * @param {Array} opts.divisions      - all active divisions
 * @param {Array} opts.weeks          - all active division_weeks
 * @param {Object} opts.parent        - parent row (for ELRC status)
 * @param {Object} opts.settings      - camp_settings as flat object
 * @returns {Object} full breakdown
 */
export function calculateBalance({ children, registrations, divisions, weeks, parent, settings }) {
    const isElrc = parent?.elrc_status === true;
  
    // Sibling discount config
    const siblingStartsAt = Number(settings?.sibling_discount_starts_at) || 2;
    const siblingCentsPerWeek = Number(settings?.sibling_discount_cents) || 0;
    const siblingElementaryOnly = settings?.sibling_discount_elementary_only ?? false;
  
    // Minimum price floor
    const minFloor = Number(settings?.minimum_weekly_price_cents) || 0;
  
    // Early bird — placeholder, not applied until decisions are finalized
    // const earlyBirdDeadline = settings?.early_bird_deadline ? new Date(settings.early_bird_deadline) : null;
    const applyEarlyBird = false; // TODO: enable when early bird rules are decided
  
    // Build lookup maps
    const divMap = Object.fromEntries(divisions.map((d) => [d.id, d]));
    const weekMap = Object.fromEntries(weeks.map((w) => [w.id, w]));
    const childMap = Object.fromEntries(children.map((c) => [c.id, c]));
  
    // Which children have active registrations
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
  
      // Determine division for sibling eligibility (preschool check)
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
  
        // Is this a partial week?
        const isPartial = wk.price_override_cents != null && wk.price_override_cents !== divBasePrice;
        const prorationRatio = divBasePrice > 0 ? (wk.price_override_cents ?? divBasePrice) / divBasePrice : 1;
  
        // Base price (ELRC prorated for partial weeks)
        let basePrice;
        if (isElrc && div.elrc_weekly_price != null) {
          basePrice = isPartial
            ? Math.round(div.elrc_weekly_price * prorationRatio)
            : div.elrc_weekly_price;
        } else {
          basePrice = wk.price_override_cents ?? divBasePrice;
        }
  
        // Sibling discount (prorated for partial weeks)
        const sibDiscount = isSiblingEligible
          ? (isPartial ? Math.round(siblingCentsPerWeek * prorationRatio) : siblingCentsPerWeek)
          : 0;
  
        // Early bird (full weeks only) — placeholder
        let earlyBird = 0;
        if (applyEarlyBird && !isPartial && div.early_bird_discount_cents) {
          earlyBird = div.early_bird_discount_cents;
        }
  
        // Apply minimum floor (prorated for partial)
        const floor = isPartial ? Math.round(minFloor * prorationRatio) : minFloor;
        const weekTotal = Math.max(floor, basePrice - sibDiscount - earlyBird);
  
        // Actual discounts applied (accounting for floor)
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
  
      // Division label
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