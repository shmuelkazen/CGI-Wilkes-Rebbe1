const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

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
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  let stripeEvent;

  try {
    if (STRIPE_WEBHOOK_SECRET) {
      const sig = event.headers["stripe-signature"];
      stripeEvent = stripe.webhooks.constructEvent(event.body, sig, STRIPE_WEBHOOK_SECRET);
    } else {
      // In test mode without webhook secret, parse directly
      stripeEvent = JSON.parse(event.body);
    }
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  if (stripeEvent.type === "checkout.session.completed") {
    const session = stripeEvent.data.object;
    const registrationIds = session.metadata?.registration_ids?.split(",").filter(Boolean);
    const discountCodeId = session.metadata?.discount_code_id;

    if (registrationIds && registrationIds.length > 0) {
      try {
        // Update each registration to paid
        for (const regId of registrationIds) {
          await supabaseQuery("registrations", {
            method: "PATCH",
            body: {
              payment_status: "paid",
              status: "confirmed",
            },
            filters: `&id=eq.${regId}`,
            headers: { Prefer: "return=minimal" },
          });
        }

        // Get parent_id from first registration for payment record
        const regs = await supabaseQuery("registrations", {
          filters: `&id=in.(${registrationIds.join(",")})`,
        });

        if (regs && regs.length > 0) {
          const parentId = regs[0].parent_id;

          // Create payment record
          await supabaseQuery("payments", {
            method: "POST",
            body: {
              parent_id: parentId,
              registration_id: regs[0].id,
              amount_cents: session.amount_total,
              provider: "stripe",
              provider_payment_id: session.payment_intent,
              status: "completed",
              method: "card",
              receipt_url: session.receipt_url || null,
              notes: registrationIds.length > 1
                ? `Payment for ${registrationIds.length} registrations`
                : null,
            },
            headers: { Prefer: "return=minimal" },
          });
        }

        console.log(`Payment completed for registrations: ${registrationIds.join(", ")}`);
      } catch (err) {
        console.error("Error processing payment:", err);
        return { statusCode: 500, body: `Processing error: ${err.message}` };
      }
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};