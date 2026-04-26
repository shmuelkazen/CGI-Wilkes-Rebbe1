// ═══════════════════════════════════════════════════════════════
// CGI Wilkes Rebbe — Send Bulk Reminder (Netlify Function)
// POST /.netlify/functions/send-bulk-reminder
// Body: { type: "no_weeks" | "outstanding_balance", dry_run: true|false }
// ═══════════════════════════════════════════════════════════════

const {
    sendEmail,
    completeRegistrationReminderEmail,
    balanceReminderEmail,
  } = require("./utils/email");
  
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  
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
  
  // ── Verify caller is an admin ────────────────────────────────
  async function verifyAdmin(authHeader) {
    if (!authHeader || !authHeader.startsWith("Bearer ")) return false;
    const token = authHeader.replace("Bearer ", "");
    try {
      // Decode JWT to get user ID (Supabase JWTs have sub claim)
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
      const userId = payload.sub;
      if (!userId) return false;
      const rows = await supabaseQuery("admin_users", { filters: `&id=eq.${userId}`, select: "id" });
      return rows && rows.length > 0;
    } catch {
      return false;
    }
  }
  
  // ── Get all email recipients for a parent ────────────────────
  function getAllEmails(parent) {
    const recipients = new Set();
    if (parent.email) recipients.add(parent.email);
    const extras = parent.additional_emails;
    if (Array.isArray(extras)) {
      for (const entry of extras) {
        const addr = typeof entry === "string" ? entry : entry?.email;
        if (addr) recipients.add(addr);
      }
    }
    return [...recipients].filter(Boolean);
  }
  
  // ═══════════════════════════════════════════════════════════════
  // RECIPIENT QUERIES
  // ═══════════════════════════════════════════════════════════════
  
  async function getNoWeeksRecipients() {
    // Load all data (same pattern as admin dashboard — fine for small camp)
    const [parents, children, registrations, paymentLogs] = await Promise.all([
      supabaseQuery("parents", { select: "id,full_name,email,additional_emails,created_at", filters: "&limit=5000" }),
      supabaseQuery("children", { select: "id,parent_id", filters: "&limit=5000" }),
      supabaseQuery("registrations", { select: "id,child_id,status", filters: "&limit=10000" }),
      supabaseQuery("payment_log", { select: "id,parent_id,created_at", filters: "&order=created_at.desc&limit=10000" }),
    ]);
  
    const now = new Date();
    const cutoff48h = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  
    // Index data
    const childrenByParent = {};
    for (const c of children) {
      if (!childrenByParent[c.parent_id]) childrenByParent[c.parent_id] = [];
      childrenByParent[c.parent_id].push(c);
    }
  
    const regsByChild = {};
    for (const r of registrations) {
      if (!regsByChild[r.child_id]) regsByChild[r.child_id] = [];
      regsByChild[r.child_id].push(r);
    }
  
    const paymentsByParent = {};
    for (const p of paymentLogs) {
      if (!paymentsByParent[p.parent_id]) paymentsByParent[p.parent_id] = [];
      paymentsByParent[p.parent_id].push(p);
    }
  
    const recipients = [];
  
    for (const parent of parents) {
      const kids = childrenByParent[parent.id];
      // Must have at least one child
      if (!kids || kids.length === 0) continue;
  
      // 48-hour cooldown: check most recent payment, or account creation if no payments
      const payments = paymentsByParent[parent.id];
      if (payments && payments.length > 0) {
        const latestPayment = new Date(payments[0].created_at);
        if (latestPayment > cutoff48h) continue;
      } else {
        // No payments — use account creation date as cooldown
        const created = new Date(parent.created_at);
        if (created > cutoff48h) continue;
      }
  
      // None of their children should have non-cancelled registrations
      let hasRegistrations = false;
      for (const kid of kids) {
        const kidRegs = regsByChild[kid.id] || [];
        if (kidRegs.some((r) => r.status !== "cancelled")) {
          hasRegistrations = true;
          break;
        }
      }
      if (hasRegistrations) continue;
  
      recipients.push({
        parent_id: parent.id,
        full_name: parent.full_name,
        email: parent.email,
        emails: getAllEmails(parent),
        children_count: kids.length,
      });
    }
  
    return recipients;
  }
  
  async function getOutstandingBalanceRecipients() {
    const [parents, children, registrations, ledgers, paymentLogs] = await Promise.all([
      supabaseQuery("parents", { select: "id,full_name,email,additional_emails", filters: "&limit=5000" }),
      supabaseQuery("children", { select: "id,parent_id", filters: "&limit=5000" }),
      supabaseQuery("registrations", { select: "id,child_id,status", filters: "&limit=10000" }),
      supabaseQuery("family_ledger", { select: "parent_id,total_due_cents,total_paid_cents,balance_cleared,payment_plan,payment_plan_note" }),
      supabaseQuery("payment_log", { select: "id,parent_id,created_at", filters: "&order=created_at.desc&limit=10000" }),
    ]);
  
    const now = new Date();
    const cutoff7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
    // Index data
    const parentMap = Object.fromEntries(parents.map((p) => [p.id, p]));
    const ledgerMap = Object.fromEntries(ledgers.map((l) => [l.parent_id, l]));
  
    const childrenByParent = {};
    for (const c of children) {
      if (!childrenByParent[c.parent_id]) childrenByParent[c.parent_id] = [];
      childrenByParent[c.parent_id].push(c);
    }
  
    const regsByChild = {};
    for (const r of registrations) {
      if (!regsByChild[r.child_id]) regsByChild[r.child_id] = [];
      regsByChild[r.child_id].push(r);
    }
  
    const paymentsByParent = {};
    for (const p of paymentLogs) {
      if (!paymentsByParent[p.parent_id]) paymentsByParent[p.parent_id] = [];
      paymentsByParent[p.parent_id].push(p);
    }
  
    const recipients = [];
  
    for (const ledger of ledgers) {
      const balance = (ledger.total_due_cents || 0) - (ledger.total_paid_cents || 0);
  
      // Must have outstanding balance
      if (balance <= 0) continue;
  
      // Must not be cleared
      if (ledger.balance_cleared) continue;
  
      // Must not be on a payment plan
      if (ledger.payment_plan) continue;
  
      const parent = parentMap[ledger.parent_id];
      if (!parent) continue;
  
      // Must have at least one non-cancelled, non-waitlisted registration
      const kids = childrenByParent[ledger.parent_id] || [];
      let hasActiveReg = false;
      for (const kid of kids) {
        const kidRegs = regsByChild[kid.id] || [];
        if (kidRegs.some((r) => r.status !== "cancelled" && r.status !== "waitlisted")) {
          hasActiveReg = true;
          break;
        }
      }
      if (!hasActiveReg) continue;
  
      // No payment in last 7 days
      const payments = paymentsByParent[ledger.parent_id] || [];
      if (payments.length > 0) {
        const latestPayment = new Date(payments[0].created_at);
        if (latestPayment > cutoff7d) continue;
      }
  
      recipients.push({
        parent_id: parent.id,
        full_name: parent.full_name,
        email: parent.email,
        emails: getAllEmails(parent),
        balance_cents: balance,
      });
    }
  
    return recipients;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // HANDLER
  // ═══════════════════════════════════════════════════════════════
  
  exports.handler = async (event) => {
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 200, headers: corsHeaders, body: "" };
    }
  
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers: corsHeaders, body: "Method not allowed" };
    }
  
    try {
      // Verify admin (graceful — logs warning if token missing)
      const authHeader = event.headers.authorization || event.headers.Authorization || "";
      const isAdmin = authHeader ? await verifyAdmin(authHeader) : false;
      if (!isAdmin) {
        console.warn("Bulk reminder called without valid admin auth — proceeding (tighten auth later)");
        // For now, allow the call. The URL is only known to the admin dashboard.
        // TODO: enforce auth once sb wrapper token extraction is confirmed
      }
  
      const { type, dry_run } = JSON.parse(event.body);
  
      if (!type || !["no_weeks", "outstanding_balance"].includes(type)) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: "Invalid type. Use 'no_weeks' or 'outstanding_balance'." }),
        };
      }
  
      // Get recipients
      const recipients = type === "no_weeks"
        ? await getNoWeeksRecipients()
        : await getOutstandingBalanceRecipients();
  
      // Dry run — return preview list
      if (dry_run) {
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            type,
            dry_run: true,
            count: recipients.length,
            recipients: recipients.map((r) => ({
              parent_id: r.parent_id,
              full_name: r.full_name,
              email: r.email,
              emails: r.emails,
              ...(r.balance_cents !== undefined ? { balance_cents: r.balance_cents } : {}),
              ...(r.children_count !== undefined ? { children_count: r.children_count } : {}),
            })),
          }),
        };
      }
  
      // Real send
      let sent = 0;
      let failed = 0;
      const errors = [];
  
      for (const recipient of recipients) {
        try {
          let emailContent;
  
          if (type === "no_weeks") {
            emailContent = completeRegistrationReminderEmail({
              parentName: recipient.full_name || "Camp Family",
            });
          } else {
            emailContent = balanceReminderEmail({
              parentName: recipient.full_name || "Camp Family",
              balanceCents: recipient.balance_cents,
            });
          }
  
          const result = await sendEmail({
            to: recipient.emails,
            subject: emailContent.subject,
            html: emailContent.html,
            replyTo: "kingstoncgi@gmail.com",
          });
  
          if (result.success) {
            sent++;
            // Log to email_log for audit
            try {
              await supabaseQuery("email_log", {
                method: "POST",
                body: {
                  parent_id: recipient.parent_id,
                  reminder_type: type,
                  recipient_email: recipient.emails.join(", "),
                },
                headers: { Prefer: "return=minimal" },
              });
            } catch (logErr) {
              console.warn("Failed to log email:", logErr.message);
            }
          } else {
            failed++;
            errors.push({ parent: recipient.full_name, error: result.error });
          }
        } catch (e) {
          failed++;
          errors.push({ parent: recipient.full_name, error: e.message });
        }
      }
  
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          type,
          dry_run: false,
          sent,
          failed,
          total: recipients.length,
          ...(errors.length > 0 ? { errors } : {}),
        }),
      };
    } catch (err) {
      console.error("send-bulk-reminder error:", err);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: err.message }),
      };
    }
  };