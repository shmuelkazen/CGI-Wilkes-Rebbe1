// ═══════════════════════════════════════════════════════════════
// CGI Wilkes Rebbe — Stripe Webhook (Netlify Function)
// Handles payment completion + sends receipt emails via Resend
// ═══════════════════════════════════════════════════════════════

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

const {
  sendEmail,
  paymentReceiptEmail,
  registrationFeeReceiptEmail,
  shirtOrderReceiptEmail,
} = require("./utils/email");

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

// ── Get parent info from the `parents` table ─────────────────
async function getParentInfo(parentId) {
  try {
    const parents = await supabaseQuery("parents", {
      filters: `&id=eq.${parentId}`,
      select: "email,full_name,additional_emails",
    });
    if (parents && parents[0]) {
      return {
        email: parents[0].email,
        name: parents[0].full_name || "Camp Family",
        additionalEmails: parents[0].additional_emails || [],
      };
    }
  } catch (e) {
    console.warn("Could not fetch parent info:", e.message);
  }
  return { email: null, name: "Camp Family", additionalEmails: [] };
}

// ── Collect all email recipients ─────────────────────────────
function getAllRecipients(parentInfo, fallbackEmail) {
  const recipients = new Set();

  // Primary email from parents table
  if (parentInfo.email) recipients.add(parentInfo.email);

  // Fallback to Stripe customer email
  if (fallbackEmail) recipients.add(fallbackEmail);

  // Additional emails from parents.additional_emails (jsonb array)
  if (Array.isArray(parentInfo.additionalEmails)) {
    for (const entry of parentInfo.additionalEmails) {
      // Could be array of strings or array of objects with .email
      const addr = typeof entry === "string" ? entry : entry?.email;
      if (addr) recipients.add(addr);
    }
  }

  return [...recipients].filter(Boolean);
}

// ── Ensure family_ledger row exists (upsert) ─────────────────
async function ensureLedgerExists(parentId) {
  const ledgers = await supabaseQuery("family_ledger", {
    filters: `&parent_id=eq.${parentId}`,
  });

  if (ledgers && ledgers.length > 0) {
    return ledgers[0];
  }

  // No row — create one
  console.log(`Creating family_ledger row for parent ${parentId}`);
  await supabaseQuery("family_ledger", {
    method: "POST",
    body: {
      parent_id: parentId,
      total_due_cents: 0,
      total_paid_cents: 0,
      discount_amount_cents: 0,
      registration_fee_paid: false,
      balance_cleared: false,
    },
    headers: { Prefer: "return=minimal" },
  });

  // Fetch the newly created row
  const newLedgers = await supabaseQuery("family_ledger", {
    filters: `&parent_id=eq.${parentId}`,
  });
  return (newLedgers && newLedgers[0]) || null;
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
    const shirtOrderId = session.metadata?.shirt_order_id;

    if (parentId && amountCents > 0) {
      try {
        // Get parent info for emails
        const parentInfo = await getParentInfo(parentId);
        const recipientEmails = getAllRecipients(parentInfo, session.customer_email);

        // ── Registration Fee ───────────────────────────────
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

          // Ensure ledger exists, then mark fee as paid
          await ensureLedgerExists(parentId);
          await supabaseQuery("family_ledger", {
            method: "PATCH",
            body: {
              registration_fee_paid: true,
              updated_at: new Date().toISOString(),
            },
            filters: `&parent_id=eq.${parentId}`,
            headers: { Prefer: "return=minimal" },
          });

          console.log(`Registration fee paid for parent ${parentId}: $${(amountCents / 100).toFixed(2)}`);

          // Send receipt email
          if (recipientEmails.length > 0) {
            const emailContent = registrationFeeReceiptEmail({
              parentName: parentInfo.name,
            });
            await sendEmail({
              to: recipientEmails,
              subject: emailContent.subject,
              html: emailContent.html,
            }).catch((e) => console.error("Email send failed (reg fee):", e));
          }

          return { statusCode: 200, body: JSON.stringify({ received: true }) };
        }

        // ── T-Shirt Order ──────────────────────────────────
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

          // Mark shirt order as paid
          if (shirtOrderId) {
            await supabaseQuery("shirt_orders", {
              method: "PATCH",
              body: {
                status: "paid",
                stripe_payment_id: session.payment_intent,
                updated_at: new Date().toISOString(),
              },
              filters: `&id=eq.${shirtOrderId}`,
              headers: { Prefer: "return=minimal" },
            });
          }

          console.log(`Shirt order paid for parent ${parentId}: $${(amountCents / 100).toFixed(2)}`);

          // Send receipt email
          if (recipientEmails.length > 0) {
            const emailContent = shirtOrderReceiptEmail({
              parentName: parentInfo.name,
              amountCents,
              items: [],
            });
            await sendEmail({
              to: recipientEmails,
              subject: emailContent.subject,
              html: emailContent.html,
            }).catch((e) => console.error("Email send failed (shirt):", e));
          }

          return { statusCode: 200, body: JSON.stringify({ received: true }) };
        }

        // ── Regular Camp Payment ───────────────────────────
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

        // 2. Ensure ledger exists, then update
        const ledger = await ensureLedgerExists(parentId);
        const totalPaidCents = (ledger?.total_paid_cents || 0) + amountCents;
        const totalDueCents = ledger?.total_due_cents || 0;

        await supabaseQuery("family_ledger", {
          method: "PATCH",
          body: {
            total_paid_cents: totalPaidCents,
            updated_at: new Date().toISOString(),
          },
          filters: `&parent_id=eq.${parentId}`,
          headers: { Prefer: "return=minimal" },
        });

        // 3. Confirm pending registrations
        const children = await supabaseQuery("children", {
          filters: `&parent_id=eq.${parentId}`,
          select: "id,first_name,last_name",
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

        // Send payment receipt email
        if (recipientEmails.length > 0) {
          const emailContent = paymentReceiptEmail({
            parentName: parentInfo.name,
            amountCents,
            totalDueCents,
            totalPaidCents,
            paymentMethod: "Credit Card (Stripe)",
            children: children
              ? children.map((c) => ({
                  name: `${c.first_name} ${c.last_name}`,
                }))
              : [],
          });
          await sendEmail({
            to: recipientEmails,
            subject: emailContent.subject,
            html: emailContent.html,
          }).catch((e) => console.error("Email send failed (payment):", e));
        }
      } catch (err) {
        console.error("Error processing payment:", err);
        return { statusCode: 500, body: `Processing error: ${err.message}` };
      }
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};