const { calculateBalance } = require("./utils/calculateBalance");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function supabaseQuery(table, { method = "GET", body, filters = "", select = "*", headers = {} } = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}${filters}`;
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      ...headers,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase ${method} ${table}: ${err}`);
  }
  if (method === "DELETE" || res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

exports.handler = async (event) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  try {
    // Load all shared data once
    const [allParents, allChildren, allDivisions, allWeeks, settingsRows, allRegistrations, allLedgers, allDiscountLogs] = await Promise.all([
      supabaseQuery("parents", { filters: "&order=full_name.asc&limit=5000" }),
      supabaseQuery("children", { filters: "&limit=10000" }),
      supabaseQuery("divisions", { filters: "&active=eq.true" }),
      supabaseQuery("division_weeks", { filters: "&active=eq.true" }),
      supabaseQuery("camp_settings"),
      supabaseQuery("registrations", { filters: "&status=in.(pending,confirmed)&limit=10000" }),
      supabaseQuery("family_ledger", { filters: "&limit=5000" }),
      supabaseQuery("payment_log", { filters: "&method=eq.discount&discount_code_id=not.is.null&limit=10000" }),
    ]);

    // Parse settings
    const settings = {};
    (settingsRows || []).forEach((row) => {
      try { settings[row.key] = JSON.parse(row.value); } catch { settings[row.key] = row.value; }
    });

    const earlyBirdDeadline = settings?.early_bird_deadline ? new Date(settings.early_bird_deadline) : null;
    const beforeDeadline = earlyBirdDeadline && new Date() < earlyBirdDeadline;

    // Index data
    const childrenByParent = {};
    (allChildren || []).forEach((c) => {
      if (!childrenByParent[c.parent_id]) childrenByParent[c.parent_id] = [];
      childrenByParent[c.parent_id].push(c);
    });

    const regsByChild = {};
    (allRegistrations || []).forEach((r) => {
      if (!regsByChild[r.child_id]) regsByChild[r.child_id] = [];
      regsByChild[r.child_id].push(r);
    });

    const ledgerByParent = {};
    (allLedgers || []).forEach((l) => { ledgerByParent[l.parent_id] = l; });

    const discountsByParent = {};
    (allDiscountLogs || []).forEach((d) => {
      if (!discountsByParent[d.parent_id]) discountsByParent[d.parent_id] = [];
      discountsByParent[d.parent_id].push(d);
    });

    const results = [];
    let updated = 0;
    let flagsSet = 0;
    let skipped = 0;

    for (const parent of (allParents || [])) {
      const children = childrenByParent[parent.id] || [];
      if (children.length === 0) { skipped++; continue; }

      const childIds = children.map((c) => c.id);
      const regs = childIds.flatMap((id) => regsByChild[id] || []);
      if (regs.length === 0) { skipped++; continue; }

      const ledger = ledgerByParent[parent.id];
      if (!ledger) { skipped++; continue; }

      // Run calculateBalance with the ledger (for early_bird_locked flag)
      const calc = calculateBalance({
        children,
        registrations: regs,
        divisions: allDivisions || [],
        weeks: allWeeks || [],
        parent,
        settings,
        ledger,
      });

      // Discount code credits
      const credits = discountsByParent[parent.id] || [];
      const totalCodeCredits = credits.reduce((sum, d) => sum + (Number(d.amount_cents) || 0), 0);
      const newTotalDue = Math.max(0, calc.totalDue - totalCodeCredits);

      // Check if early bird should be locked
      const totalPaid = ledger.total_paid_cents || 0;
      const totalForgiven = ledger.forgiven_cents || 0;
      const effectiveBalance = newTotalDue - totalPaid - totalForgiven;
      const shouldLock = beforeDeadline && effectiveBalance <= 0 && newTotalDue > 0 && !ledger.early_bird_locked;

      // Build patch
      const patchBody = {
        total_due_cents: newTotalDue,
        discount_amount_cents: calc.discounts.total + totalCodeCredits,
        updated_at: new Date().toISOString(),
      };
      if (shouldLock) {
        patchBody.early_bird_locked = true;
        flagsSet++;
      }

      const changed = ledger.total_due_cents !== newTotalDue || shouldLock;

      if (changed) {
        await supabaseQuery("family_ledger", {
          method: "PATCH",
          body: patchBody,
          filters: `&parent_id=eq.${parent.id}`,
          headers: { Prefer: "return=minimal" },
        });
        updated++;
        results.push({
          parent: parent.full_name || parent.email,
          oldDue: ledger.total_due_cents,
          newDue: newTotalDue,
          paid: totalPaid,
          forgiven: totalForgiven,
          balance: effectiveBalance,
          earlyBirdLocked: shouldLock ? "SET" : (ledger.early_bird_locked ? "already" : "no"),
        });
      } else {
        skipped++;
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        summary: {
          total_families: (allParents || []).length,
          updated,
          flags_set: flagsSet,
          skipped,
          before_deadline: beforeDeadline,
        },
        changes: results,
      }, null, 2),
    };
  } catch (err) {
    console.error("Recalc error:", err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message }),
    };
  }
};