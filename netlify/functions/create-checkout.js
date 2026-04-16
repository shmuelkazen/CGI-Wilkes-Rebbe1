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
    const { parentId, parentEmail, amountCents, siteUrl, isRegistrationFee } = JSON.parse(event.body);

    if (!parentId || !amountCents || amountCents <= 0) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Parent ID and amount are required" }) };
    }

    // Fetch parent info
    const parents = await supabaseQuery("parents", { filters: `&id=eq.${parentId}` });
    const parent = parents && parents[0];
    const email = parentEmail || parent?.email || "";

    const baseUrl = siteUrl || process.env.SITE_URL || "https://comforting-custard-5d02c6.netlify.app";

    // Registration fee — simple checkout, no need to look up children/registrations
    if (isRegistrationFee) {
      const checkoutSession = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: "CGI Wilkes Rebbe — Registration Fee",
                description: "One-time family registration fee",
              },
              unit_amount: amountCents,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        customer_email: email,
        success_url: `${baseUrl}?payment=success`,
        cancel_url: `${baseUrl}?payment=cancelled`,
        metadata: {
          parent_id: parentId,
          amount_cents: String(amountCents),
          is_registration_fee: "true",
        },
      });

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ url: checkoutSession.url }),
      };
    }

    // Regular camp payment — existing logic unchanged
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
    if (divisionIds.length > 0) {
      divisions = await supabaseQuery("divisions", { filters: `&id=in.(${divisionIds.join(",")})` }) || [];
    }
    if (weekIds.length > 0) {
      weeks = await supabaseQuery("division_weeks", { filters: `&id=in.(${weekIds.join(",")})` }) || [];
    }
    const divMap = Object.fromEntries(divisions.map((d) => [d.id, d]));
    const weekMap = Object.fromEntries(weeks.map((w) => [w.id, w]));
    const childMap = Object.fromEntries((children || []).map((c) => [c.id, c]));

    const description = registrations.map((r) => {
      const child = childMap[r.child_id];
      const div = divMap[r.division_id];
      const wk = weekMap[r.week_id];
      return `${child?.first_name || "?"} — ${div?.name || "?"} ${wk?.name || ""}`;
    }).join(", ");

    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `CGI Wilkes Rebbe — ${childNames || "Camp Registration"}`,
              description: description || "Camp registration payment",
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      customer_email: email,
      success_url: `${baseUrl}?payment=success`,
      cancel_url: `${baseUrl}?payment=cancelled`,
      metadata: {
        parent_id: parentId,
        amount_cents: String(amountCents),
      },
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ url: checkoutSession.url }),
    };
  } catch (err) {
    console.error("Checkout error:", err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message }),
    };
  }
};