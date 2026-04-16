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
      stripeEvent = JSON.parse(event.body);
    }
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  if (stripeEvent.type === "checkout.session.completed") {
    const session = stripeEvent.data.object;
    const parentId = session.metadata?.parent_id;
    const amountCents = parseInt(session.metadata?.amount_cents || session.amount_total || 0);
    const isRegistrationFee = session.metadata?.is_registration_fee === "true";

    if (parentId && amountCents > 0) {
      try {
        // 1. Log the payment (always, regardless of type)
        await supabaseQuery("payment_log", {
          method: "POST",
          body: {
            parent_id: parentId,
            amount_cents: amountCents,
            method: "stripe",
            stripe_payment_id: session.payment_intent,
            notes: isRegistrationFee ? "Registration fee" : `Stripe checkout ${session.id}`,
          },
          headers: { Prefer: "return=minimal" },
        });

        // 2. Get or create family ledger
        const ledgers = await supabaseQuery("family_ledger", {
          filters: `&parent_id=eq.${parentId}`,
        });
        const ledger = ledgers && ledgers[0];

        if (isRegistrationFee) {
          // Registration fee: mark as paid, don't touch total_paid_cents or registrations
          if (ledger) {
            await supabaseQuery("family_ledger", {
              method: "PATCH",
              body: {
                registration_fee_paid: true,
                updated_at: new Date().toISOString(),
              },
              filters: `&parent_id=eq.${parentId}`,
              headers: { Prefer: "return=minimal" },
            });
          } else {
            await supabaseQuery("family_ledger", {
              method: "POST",
              body: {
                parent_id: parentId,
                registration_fee_paid: true,
                total_due_cents: 0,
                total_paid_cents: 0,
              },
              headers: { Prefer: "return=minimal" },
            });
          }
          console.log(`Registration fee paid for parent ${parentId}: $${(amountCents / 100).toFixed(2)}`);
        } else {
          // Regular camp payment: update total_paid and confirm registrations
          if (ledger) {
            const newPaid = (ledger.total_paid_cents || 0) + amountCents;
            await supabaseQuery("family_ledger", {
              method: "PATCH",
              body: {
                total_paid_cents: newPaid,
                updated_at: new Date().toISOString(),
              },
              filters: `&parent_id=eq.${parentId}`,
              headers: { Prefer: "return=minimal" },
            });
          }

          // 3. Confirm all pending registrations for this parent's children
          const children = await supabaseQuery("children", {
            filters: `&parent_id=eq.${parentId}`,
          });
          if (children && children.length > 0) {
            const childIds = children.map((c) => c.id);
            await supabaseQuery("registrations", {
              method: "PATCH",
              body: {
                status: "confirmed",
                updated_at: new Date().toISOString(),
              },
              filters: `&child_id=in.(${childIds.join(",")})&status=eq.pending`,
              headers: { Prefer: "return=minimal" },
            });
          }

          console.log(`Payment completed for parent ${parentId}: $${(amountCents / 100).toFixed(2)}`);
        }
      } catch (err) {
        console.error("Error processing payment:", err);
        return { statusCode: 500, body: `Processing error: ${err.message}` };
      }
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};