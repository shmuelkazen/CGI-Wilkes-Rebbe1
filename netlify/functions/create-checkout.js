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
    const { registrationIds, parentEmail, discountCode, siteUrl } = JSON.parse(event.body);

    if (!registrationIds || registrationIds.length === 0) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "No registrations provided" }) };
    }

    // Fetch registrations with session details
    const registrations = await supabaseQuery("registrations", {
      filters: `&id=in.(${registrationIds.join(",")})&payment_status=eq.unpaid`,
    });

    if (!registrations || registrations.length === 0) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "No unpaid registrations found" }) };
    }

    // Fetch session details for names
    const sessionIds = [...new Set(registrations.map((r) => r.session_id))];
    const sessions = await supabaseQuery("sessions", {
      filters: `&id=in.(${sessionIds.join(",")})`,
    });
    const sessionMap = Object.fromEntries((sessions || []).map((s) => [s.id, s]));

    // Fetch child details for names
    const childIds = [...new Set(registrations.map((r) => r.child_id))];
    const children = await supabaseQuery("children", {
      filters: `&id=in.(${childIds.join(",")})`,
    });
    const childMap = Object.fromEntries((children || []).map((c) => [c.id, c]));

    // Check for discount code
    let discountAmount = 0;
    let discountType = null;
    let discountId = null;

    if (discountCode) {
      const codes = await supabaseQuery("discount_codes", {
        filters: `&code=eq.${discountCode}&active=eq.true`,
      });
      const code = codes && codes[0];

      if (code) {
        const now = new Date();
        const notExpired = !code.expires_at || new Date(code.expires_at) > now;
        const notMaxed = !code.max_uses || (code.times_used || 0) < code.max_uses;

        if (notExpired && notMaxed) {
          discountType = code.type;
          discountAmount = code.amount;
          discountId = code.id;
        }
      }
    }

    // Build line items
    let subtotal = 0;
    const lineItems = registrations.map((r) => {
      const ses = sessionMap[r.session_id];
      const child = childMap[r.child_id];
      const amount = r.payment_amount_cents || ses?.price_cents || 0;
      subtotal += amount;
      return {
        price_data: {
          currency: "usd",
          product_data: {
            name: `${ses?.name || "Camp Session"} — ${child?.first_name || ""} ${child?.last_name || ""}`,
          },
          unit_amount: amount,
        },
        quantity: 1,
      };
    });

    // Apply discount
    let discountCoupon = undefined;
    if (discountId && discountAmount > 0) {
      if (discountType === "percent") {
        discountCoupon = await stripe.coupons.create({
          percent_off: discountAmount,
          duration: "once",
        });
      } else {
        // flat amount in cents
        discountCoupon = await stripe.coupons.create({
          amount_off: discountAmount,
          currency: "usd",
          duration: "once",
        });
      }
    }

    const baseUrl = siteUrl || process.env.SITE_URL || "https://comforting-custard-5d02c6.netlify.app";

    // Create Stripe Checkout Session
    const sessionParams = {
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      customer_email: parentEmail,
      success_url: `${baseUrl}?payment=success`,
      cancel_url: `${baseUrl}?payment=cancelled`,
      metadata: {
        registration_ids: registrationIds.join(","),
        discount_code_id: discountId || "",
      },
    };

    if (discountCoupon) {
      sessionParams.discounts = [{ coupon: discountCoupon.id }];
    }

    const checkoutSession = await stripe.checkout.sessions.create(sessionParams);

    // If discount code was used, increment usage
    if (discountId) {
      const currentCode = (await supabaseQuery("discount_codes", { filters: `&id=eq.${discountId}` }))?.[0];
      if (currentCode) {
        await supabaseQuery("discount_codes", {
          method: "PATCH",
          body: { times_used: (currentCode.times_used || 0) + 1 },
          filters: `&id=eq.${discountId}`,
          headers: { Prefer: "return=minimal" },
        });
      }
    }

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