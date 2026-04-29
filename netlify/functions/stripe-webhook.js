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

  // ═══════════════════════════════════════════════════════════
  // CHECKOUT.SESSION.COMPLETED — Regular checkout payments
  // ═══════════════════════════════════════════════════════════
  if (stripeEvent.type === "checkout.session.completed") {
    const session = stripeEvent.data.object;
    const parentId = session.metadata?.parent_id;
    const amountCents = parseInt(session.metadata?.amount_cents || session.amount_total || 0);
    const isRegistrationFee = session.metadata?.is_registration_fee === "true";
    const isShirtOrder = session.metadata?.is_shirt_order === "true";
    const shirtOrderId = session.metadata?.shirt_order_id;

    if (parentId && amountCents > 0) {
      try {
        // Ensure stripe_customer_id is saved (safety net — create-checkout should have done this)
        if (session.customer) {
          await supabaseQuery("parents", {
            method: "PATCH",
            body: { stripe_customer_id: session.customer },
            filters: `&id=eq.${parentId}&stripe_customer_id=is.null`,
            headers: { Prefer: "return=minimal" },
          }).catch((e) => console.warn("Could not save stripe_customer_id:", e.message));
        }
        // Get parent info for emails
        const parentInfo = await getParentInfo(parentId);
        const recipientEmails = getAllRecipients(parentInfo, session.customer_email);

        // ── Registration Fee ───────────────────────────────
        if (isRegistrationFee) {
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

          if (shirtOrderId) {
            await supabaseQuery("shirt_orders", {
              method: "PATCH",
              body: {
                status: "paid",
                stripe_payment_id: session.payment_intent,
                updated_at: new Date().toISOString(),
              },
              filters: `&id=in.(${shirtOrderId})`,
              headers: { Prefer: "return=minimal" },
            });
          }

          console.log(`Shirt order paid for parent ${parentId}: $${(amountCents / 100).toFixed(2)}`);

          if (recipientEmails.length > 0) {
            // Load the actual shirt order details for the receipt
            let shirtItems = [];
            if (shirtOrderId) {
              const orders = await supabaseQuery("shirt_orders", {
                filters: `&id=in.(${shirtOrderId})`,
              });
              shirtItems = (orders || []).map((o) => ({
                size: `${o.shirt_type ? o.shirt_type + " " : ""}${o.size}`,
                quantity: o.quantity,
                priceEach: o.quantity > 0 ? Math.round(o.price_cents / o.quantity) : o.price_cents,
              }));
            }
            const emailContent = shirtOrderReceiptEmail({
              parentName: parentInfo.name,
              amountCents,
              items: shirtItems,
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

        // 2. Ensure ledger exists, then update paid amount
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

        console.log(`Payment completed for parent ${parentId}: $${(amountCents / 100).toFixed(2)}`);

        // 3. Send payment receipt email
        const children = await supabaseQuery("children", {
          filters: `&parent_id=eq.${parentId}`,
          select: "id,first_name,last_name",
        });

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

  // ═══════════════════════════════════════════════════════════
  // INVOICE.PAID — Manual Stripe invoices (payment plans, etc.)
  // ═══════════════════════════════════════════════════════════
  if (stripeEvent.type === "invoice.paid") {
    const invoice = stripeEvent.data.object;
    const customerId = invoice.customer;
    const amountCents = invoice.amount_paid;

    // Skip zero-amount invoices (e.g. Stripe subscription trials)
    if (!customerId || !amountCents || amountCents <= 0) {
      console.log("invoice.paid skipped — no customer or zero amount");
      return { statusCode: 200, body: JSON.stringify({ received: true }) };
    }

    try {
      // Look up parent by stripe_customer_id
      const parents = await supabaseQuery("parents", {
        filters: `&stripe_customer_id=eq.${customerId}`,
        select: "id,email,full_name,additional_emails",
      });

      if (!parents || parents.length === 0) {
        console.warn(`invoice.paid — no parent found for Stripe customer ${customerId}`);
        return { statusCode: 200, body: JSON.stringify({ received: true }) };
      }

      const parent = parents[0];
      const parentId = parent.id;

      // 1. Log the payment
      await supabaseQuery("payment_log", {
        method: "POST",
        body: {
          parent_id: parentId,
          amount_cents: amountCents,
          method: "stripe",
          stripe_payment_id: invoice.payment_intent,
          notes: `Stripe invoice ${invoice.id}`,
        },
        headers: { Prefer: "return=minimal" },
      });

      // 2. Update ledger
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

      console.log(`Invoice payment for parent ${parentId}: $${(amountCents / 100).toFixed(2)}`);

      // 3. Send receipt email
      const parentInfo = {
        email: parent.email,
        name: parent.full_name || "Camp Family",
        additionalEmails: parent.additional_emails || [],
      };
      const recipientEmails = getAllRecipients(parentInfo, null);

      if (recipientEmails.length > 0) {
        const children = await supabaseQuery("children", {
          filters: `&parent_id=eq.${parentId}`,
          select: "id,first_name,last_name",
        });

        const emailContent = paymentReceiptEmail({
          parentName: parentInfo.name,
          amountCents,
          totalDueCents,
          totalPaidCents,
          paymentMethod: "Credit Card (Stripe Invoice)",
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
        }).catch((e) => console.error("Email send failed (invoice):", e));
      }
    } catch (err) {
      console.error("Error processing invoice.paid:", err);
      return { statusCode: 500, body: `Processing error: ${err.message}` };
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};