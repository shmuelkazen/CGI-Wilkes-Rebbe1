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
    const isShirtOrder = session.metadata?.is_shirt_order === "true";
    const shirtOrderId = session.metadata?.shirt_order_id || null;

    if (parentId && amountCents > 0) {
      try {
        // ── Registration Fee ──
        if (isRegistrationFee) {
          // Log payment
          await supabaseQuery("payment_log", {
            method: "POST",
            body: {
              parent_id: parentId,
              amount_cents: amountCents,
              method: "stripe",
              stripe_payment_id: session.payment_intent,
              notes: "Registration fee",
            },
            headers: { Prefer: "return=minimal" },
          });

          // Mark fee as paid on ledger
          const ledgers = await supabaseQuery("family_ledger", { filters: `&parent_id=eq.${parentId}` });
          const ledger = ledgers && ledgers[0];
          if (ledger) {
            await supabaseQuery("family_ledger", {
              method: "PATCH",
              body: { registration_fee_paid: true, updated_at: new Date().toISOString() },
              filters: `&parent_id=eq.${parentId}`,
              headers: { Prefer: "return=minimal" },
            });
          } else {
            await supabaseQuery("family_ledger", {
              method: "POST",
              body: { parent_id: parentId, registration_fee_paid: true, total_due_cents: 0, total_paid_cents: 0 },
              headers: { Prefer: "return=minimal" },
            });
          }

          console.log(`Registration fee paid for parent ${parentId}: $${(amountCents / 100).toFixed(2)}`);
          return { statusCode: 200, body: JSON.stringify({ received: true }) };
        }

        // ── T-Shirt Order ──
        if (isShirtOrder) {
          // Log payment
          await supabaseQuery("payment_log", {
            method: "POST",
            body: {
              parent_id: parentId,
              amount_cents: amountCents,
              method: "stripe",
              stripe_payment_id: session.payment_intent,
              notes: "T-shirt order",
            },
            headers: { Prefer: "return=minimal" },
          });

          // Mark shirt order(s) as paid — shirtOrderId can be comma-separated for batch orders
          if (shirtOrderId) {
            const orderIds = shirtOrderId.split(",").filter(Boolean);
            for (const oid of orderIds) {
              await supabaseQuery("shirt_orders", {
                method: "PATCH",
                body: { status: "paid", stripe_payment_id: session.payment_intent, updated_at: new Date().toISOString() },
                filters: `&id=eq.${oid}`,
                headers: { Prefer: "return=minimal" },
              });
            }
          }

          console.log(`Shirt order paid for parent ${parentId}: $${(amountCents / 100).toFixed(2)}`);
          return { statusCode: 200, body: JSON.stringify({ received: true }) };
        }

        // ── Regular Camp Payment ──
        // 1. Log payment
        await supabaseQuery("payment_log", {
          method: "POST",
          body: {
            parent_id: parentId,
            amount_cents: amountCents,
            method: "stripe",
            stripe_payment_id: session.payment_intent,
            notes: `Stripe checkout ${session.id}`,
          },
          headers: { Prefer: "return=minimal" },
        });

        // 2. Update family ledger
        const ledgers = await supabaseQuery("family_ledger", { filters: `&parent_id=eq.${parentId}` });
        const ledger = ledgers && ledgers[0];
        if (ledger) {
          const newPaid = (ledger.total_paid_cents || 0) + amountCents;
          await supabaseQuery("family_ledger", {
            method: "PATCH",
            body: { total_paid_cents: newPaid, updated_at: new Date().toISOString() },
            filters: `&parent_id=eq.${parentId}`,
            headers: { Prefer: "return=minimal" },
          });
        }

        // 3. Confirm pending registrations
        const children = await supabaseQuery("children", { filters: `&parent_id=eq.${parentId}` });
        if (children && children.length > 0) {
          const childIds = children.map((c) => c.id);
          await supabaseQuery("registrations", {
            method: "PATCH",
            body: { status: "confirmed", updated_at: new Date().toISOString() },
            filters: `&child_id=in.(${childIds.join(",")})&status=eq.pending`,
            headers: { Prefer: "return=minimal" },
          });
        }

        console.log(`Payment completed for parent ${parentId}: $${(amountCents / 100).toFixed(2)}`);
      } catch (err) {
        console.error("Error processing payment:", err);
        return { statusCode: 500, body: `Processing error: ${err.message}` };
      }
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};