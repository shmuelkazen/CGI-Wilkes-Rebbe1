const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

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
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { parentId, parentEmail, amountCents, siteUrl, isRegistrationFee, isShirtOrder, shirtOrderId, shirtDescription } = JSON.parse(event.body);

    if (!parentId || !amountCents || amountCents <= 0) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Parent ID and amount are required" }) };
    }

    const parents = await supabaseQuery("parents", { filters: `&id=eq.${parentId}` });
    const parent = parents && parents[0];
    const email = parentEmail || parent?.email || "";
    const baseUrl = siteUrl || process.env.SITE_URL || "https://register.cgikingston.com";

    // ── Registration Fee ──
    if (isRegistrationFee) {
      const checkoutSession = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: { name: "CGI Wilkes Rebbe — Registration Fee", description: "One-time family registration fee" },
            unit_amount: amountCents,
          },
          quantity: 1,
        }],
        mode: "payment",
        customer_email: email,
        success_url: `${baseUrl}?payment=success`,
        cancel_url: `${baseUrl}?payment=cancelled`,
        metadata: { parent_id: parentId, amount_cents: String(amountCents), is_registration_fee: "true" },
      });
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ url: checkoutSession.url }) };
    }

    // ── T-Shirt Order ──
    if (isShirtOrder) {
      const checkoutSession = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: { name: "CGI Wilkes Rebbe — T-Shirt", description: shirtDescription || "T-shirt order" },
            unit_amount: amountCents,
          },
          quantity: 1,
        }],
        mode: "payment",
        customer_email: email,
        success_url: `${baseUrl}?payment=success`,
        cancel_url: `${baseUrl}?payment=cancelled`,
        metadata: { parent_id: parentId, amount_cents: String(amountCents), is_shirt_order: "true", shirt_order_id: shirtOrderId || "" },
      });
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ url: checkoutSession.url }) };
    }

    // ── Regular Camp Payment ──
    const children = await supabaseQuery("children", { filters: `&parent_id=eq.${parentId}` });
    const childNames = (children || []).map((c) => `${c.first_name} ${c.last_name}`).join(", ");

    const childIds = (children || []).map((c) => c.id);
    let registrations = [];
    if (childIds.length > 0) {
      registrations = await supabaseQuery("registrations", {
        filters: `&child_id=in.(${childIds.join(",")})&status=in.(pending,confirmed)`,
      }) || [];
    }

    const divisionIds = [...new Set(registrations.map((r) => r.division_id).filter(Boolean))];
    const weekIds = [...new Set(registrations.map((r) => r.week_id).filter(Boolean))];
    let divisions = [];
    let weeks = [];
    if (divisionIds.length > 0) divisions = await supabaseQuery("divisions", { filters: `&id=in.(${divisionIds.join(",")})` }) || [];
    if (weekIds.length > 0) weeks = await supabaseQuery("division_weeks", { filters: `&id=in.(${weekIds.join(",")})` }) || [];
    const divMap = Object.fromEntries(divisions.map((d) => [d.id, d]));
    const weekMap = Object.fromEntries(weeks.map((w) => [w.id, w]));
    const childMap = Object.fromEntries((children || []).map((c) => [c.id, c]));

    // Group registrations by child
    const regsByChild = {};
    for (const r of registrations) {
      if (!regsByChild[r.child_id]) regsByChild[r.child_id] = [];
      regsByChild[r.child_id].push(r);
    }

    // Build one line item per camper
    const totalRegs = registrations.length;
    const perRegCents = Math.floor(amountCents / totalRegs);
    let centsAssigned = 0;
    const childEntries = Object.entries(regsByChild);

    const line_items = childEntries.map(([childId, regs], idx) => {
      const child = childMap[childId];
      const childName = child ? `${child.first_name} ${child.last_name}` : "Camper";
      const divNames = [...new Set(regs.map((r) => divMap[r.division_id]?.name).filter(Boolean))];
      const weekNames = regs
        .map((r) => weekMap[r.week_id]?.name)
        .filter(Boolean)
        .sort();

      // Format week range (e.g. "Weeks 1–8") or list
      const weekNums = weekNames.map((w) => {
        const m = w.match(/(\d+)/);
        return m ? parseInt(m[1]) : null;
      }).filter(Boolean).sort((a, b) => a - b);

      let weekLabel;
      if (weekNums.length > 1 && weekNums[weekNums.length - 1] - weekNums[0] === weekNums.length - 1) {
        weekLabel = `Weeks ${weekNums[0]}–${weekNums[weekNums.length - 1]}`;
      } else {
        weekLabel = weekNums.length > 0 ? `Weeks ${weekNums.join(", ")}` : `${regs.length} week(s)`;
      }

      // Distribute cents proportionally by number of registrations
      // Last child gets the remainder to ensure total is exact
      const isLast = idx === childEntries.length - 1;
      const childCents = isLast
        ? amountCents - centsAssigned
        : perRegCents * regs.length;
      centsAssigned += childCents;

      return {
        price_data: {
          currency: "usd",
          product_data: {
            name: `${childName} — ${divNames.join(", ") || "Camp"}`,
            description: weekLabel,
          },
          unit_amount: childCents,
        },
        quantity: 1,
      };
    });

    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items,
      mode: "payment",
      customer_email: email,
      success_url: `${baseUrl}?payment=success`,
      cancel_url: `${baseUrl}?payment=cancelled`,
      metadata: { parent_id: parentId, amount_cents: String(amountCents) },
    });

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ url: checkoutSession.url }) };
  } catch (err) {
    console.error("Checkout error:", err);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
  }
};