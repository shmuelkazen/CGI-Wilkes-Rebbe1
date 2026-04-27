const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
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

// ── Get or create a Stripe Customer for this parent ──────────
async function getOrCreateStripeCustomer(parent, email) {
  // Already have a Stripe Customer ID saved
  if (parent?.stripe_customer_id) {
    try {
      const existing = await stripe.customers.retrieve(parent.stripe_customer_id);
      if (!existing.deleted) return existing.id;
    } catch (e) {
      console.warn("Saved Stripe customer not found, creating new:", e.message);
    }
  }

  // Create new Stripe Customer
  const customer = await stripe.customers.create({
    email: email || undefined,
    name: parent?.full_name || undefined,
    metadata: { parent_id: parent?.id || "" },
  });

  // Save to parents table
  if (parent?.id) {
    await supabaseQuery("parents", {
      method: "PATCH",
      body: { stripe_customer_id: customer.id },
      filters: `&id=eq.${parent.id}`,
      headers: { Prefer: "return=minimal" },
    });
  }

  return customer.id;
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

    const parents = await supabaseQuery("parents", { filters: `&id=eq.${parentId}`, select: "*" });
    const parent = parents && parents[0];
    const email = parentEmail || parent?.email || "";
    const baseUrl = siteUrl || process.env.SITE_URL || "https://register.cgikingston.com";

    // Get or create Stripe Customer (saves card for future charges/refunds)
    const stripeCustomerId = await getOrCreateStripeCustomer(parent, email);

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
        customer: stripeCustomerId,
        payment_intent_data: { setup_future_usage: "off_session" },
        custom_text: { submit: { message: "I authorize CGI Wilkes Rebbe to charge this payment method for any remaining camp balance." } },
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
        customer: stripeCustomerId,
        payment_intent_data: { setup_future_usage: "off_session" },
        custom_text: { submit: { message: "I authorize CGI Wilkes Rebbe to charge this payment method for any remaining camp balance." } },
        success_url: `${baseUrl}?payment=success`,
        cancel_url: `${baseUrl}?payment=cancelled`,
        metadata: { parent_id: parentId, amount_cents: String(amountCents), is_shirt_order: "true", shirt_order_id: shirtOrderId || "" },
      });
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ url: checkoutSession.url }) };
    }

    // ── Regular Camp Payment ──
    const children = await supabaseQuery("children", { filters: `&parent_id=eq.${parentId}` });

    const childIds = (children || []).map((c) => c.id);
    let registrations = [];
    if (childIds.length > 0) {
      registrations = await supabaseQuery("registrations", {
        filters: `&child_id=in.(${childIds.join(",")})&status=in.(pending,confirmed)`,
      }) || [];
    }

    if (registrations.length === 0) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "No active registrations found." }) };
    }

    const divisionIds = [...new Set(registrations.map((r) => r.division_id).filter(Boolean))];
    const weekIds = [...new Set(registrations.map((r) => r.week_id).filter(Boolean))];
    let divisions = [];
    let weeks = [];
    if (divisionIds.length > 0) divisions = await supabaseQuery("divisions", { filters: `&id=in.(${divisionIds.join(",")})` }) || [];
    if (weekIds.length > 0) weeks = await supabaseQuery("division_weeks", { filters: `&id=in.(${weekIds.join(",")})` }) || [];

    // Load settings
    const settingsRows = await supabaseQuery("camp_settings") || [];
    const settings = {};
    settingsRows.forEach((row) => {
      try { settings[row.key] = JSON.parse(row.value); } catch { settings[row.key] = row.value; }
    });

    // Server-side recalculation — single source of truth
    const calc = calculateBalance({
      children: children || [],
      registrations,
      divisions,
      weeks,
      parent,
      settings,
    });

    // Get code discount credits and payments from ledger
    const discountLogs = await supabaseQuery("payment_log", {
      filters: `&parent_id=eq.${parentId}&method=eq.discount&discount_code_id=not.is.null`,
    }) || [];
    const totalCodeCredits = discountLogs.reduce((sum, d) => sum + (Number(d.amount_cents) || 0), 0);

    const ledger = await supabaseQuery("family_ledger", { filters: `&parent_id=eq.${parentId}` });
    const totalPaid = (ledger && ledger[0]?.total_paid_cents) || 0;
    const totalForgiven = (ledger && ledger[0]?.forgiven_cents) || 0;

    const serverBalance = Math.max(0, calc.totalDue - totalCodeCredits - totalPaid - totalForgiven);

    // Validate requested amount against server-calculated balance
    if (amountCents > serverBalance) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: `Amount exceeds balance. Server balance: $${(serverBalance / 100).toFixed(2)}` }) };
    }

    // Build clean line items from recalculation
    const divMap = Object.fromEntries(divisions.map((d) => [d.id, d]));
    const weekMap = Object.fromEntries(weeks.map((w) => [w.id, w]));
    let centsAssigned = 0;

    const line_items = calc.children.map((cb, idx) => {
      const weekNums = cb.weeks.map((w) => {
        const m = w.weekName.match(/(\d+)/);
        return m ? parseInt(m[1]) : null;
      }).filter(Boolean).sort((a, b) => a - b);

      let weekLabel;
      if (weekNums.length > 1 && weekNums[weekNums.length - 1] - weekNums[0] === weekNums.length - 1) {
        weekLabel = `Weeks ${weekNums[0]}–${weekNums[weekNums.length - 1]}`;
      } else {
        weekLabel = weekNums.length > 0 ? `Weeks ${weekNums.join(", ")}` : `${cb.weeks.length} week(s)`;
      }

      // Proportional split of the requested payment amount
      const isLast = idx === calc.children.length - 1;
      const childShare = serverBalance > 0 ? cb.subtotal / calc.totalDue : 1 / calc.children.length;
      const childCents = isLast
        ? amountCents - centsAssigned
        : Math.round(amountCents * childShare);
      centsAssigned += childCents;

      return {
        price_data: {
          currency: "usd",
          product_data: {
            name: `${cb.childName} — ${cb.division || "Camp"}`,
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
      customer: stripeCustomerId,
      payment_intent_data: { setup_future_usage: "off_session" },
      custom_text: { submit: { message: "I authorize CGI Wilkes Rebbe to charge this payment method for any remaining camp balance." } },
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