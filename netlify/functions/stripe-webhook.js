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

// ── Get parent email and name ────────────────────────────────
async function getParentInfo(parentId) {
  try {
    const profiles = await supabaseQuery("parent_profiles", {
      filters: `&id=eq.${parentId}`,
      select: "email,full_name",
    });
    if (profiles && profiles[0]) {
      return {
        email: profiles[0].email,
        name: profiles[0].full_name || "Camp Family",
      };
    }
  } catch (e) {
    console.warn("Could not fetch parent profile:", e.message);
  }
  return { email: null, name: "Camp Family" };
}

// ── Get all email recipients for a parent ────────────────────
async function getEmailRecipients(parentId, primaryEmail) {
  const recipients = new Set();
  if (primaryEmail) recipients.add(primaryEmail);

  try {
    const children = await supabaseQuery("children", {
      filters: `&parent_id=eq.${parentId}`,
      select: "additional_email",
    });
    if (children) {
      for (const child of children) {
        if (child.additional_email) {
          recipients.add(child.additional_email);
        }
      }
    }
  } catch (e) {
    // Column may not exist — fine
  }

  return [...recipients].filter(Boolean);
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
        const recipientEmails = await getEmailRecipients(parentId, parentInfo.email || session.customer_email);

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

          // Mark fee as paid on ledger
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

          // ── Send registration fee receipt email ──────────
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

          // ── Send shirt order receipt email ────────────────
          if (recipientEmails.length > 0) {
            const emailContent = shirtOrderReceiptEmail({
              parentName: parentInfo.name,
              amountCents,
              items: [], // We don't have item details in webhook metadata — kept simple
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

        // 2. Update family ledger
        const ledgers = await supabaseQuery("family_ledger", {
          filters: `&parent_id=eq.${parentId}`,
        });
        const ledger = ledgers && ledgers[0];
        let totalPaidCents = amountCents;
        let totalDueCents = 0;

        if (ledger) {
          totalPaidCents = (ledger.total_paid_cents || 0) + amountCents;
          totalDueCents = ledger.total_due_cents || 0;
          await supabaseQuery("family_ledger", {
            method: "PATCH",
            body: {
              total_paid_cents: totalPaidCents,
              updated_at: new Date().toISOString(),
            },
            filters: `&parent_id=eq.${parentId}`,
            headers: { Prefer: "return=minimal" },
          });
        }

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

        // ── Send payment receipt email ──────────────────────
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
        // Don't return 500 for email failures — payment processing succeeded
        // Only return 500 if the actual payment/ledger processing failed
        return { statusCode: 500, body: `Processing error: ${err.message}` };
      }
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};