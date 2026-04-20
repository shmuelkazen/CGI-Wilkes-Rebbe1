// ═══════════════════════════════════════════════════════════════
// CGI Wilkes Rebbe — Send Email (Netlify Function)
// Called by the frontend to send transactional emails
// POST /.netlify/functions/send-email
// ═══════════════════════════════════════════════════════════════

const {
  sendEmail,
  registrationConfirmationEmail,
  statusChangeEmail,
  shirtOrderReceiptEmail,
  waitlistConfirmationEmail,
  waitlistApprovedEmail,
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

// ── Get all email recipients for a parent ────────────────────
async function getEmailRecipients(parentId) {
  const recipients = new Set();

  try {
    const parents = await supabaseQuery("parents", {
      filters: `&id=eq.${parentId}`,
      select: "email,additional_emails",
    });
    if (parents && parents[0]) {
      if (parents[0].email) recipients.add(parents[0].email);

      // additional_emails is jsonb — could be array of strings or objects
      const extras = parents[0].additional_emails;
      if (Array.isArray(extras)) {
        for (const entry of extras) {
          const addr = typeof entry === "string" ? entry : entry?.email;
          if (addr) recipients.add(addr);
        }
      }
    }
  } catch (e) {
    console.warn("Could not fetch parent emails:", e.message);
  }

  return [...recipients].filter(Boolean);
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: "Method not allowed" };
  }

  try {
    const { type, data } = JSON.parse(event.body);

    if (!type || !data) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Missing type or data" }),
      };
    }

    let emailContent;
    let recipientEmails;

    switch (type) {
      // ── Registration Confirmation ──────────────────────────
      case "registration_confirmation": {
        const { parentId, parentName, parentEmail, children, totalDue, registrationFeePaid } = data;
        emailContent = registrationConfirmationEmail({
          parentName: parentName || "Camp Family",
          children: children || [],
          totalDue: totalDue || 0,
          registrationFeePaid: registrationFeePaid || false,
        });

        recipientEmails = [parentEmail];
        if (parentId) {
          const extras = await getEmailRecipients(parentId);
          for (const e of extras) {
            if (!recipientEmails.includes(e)) recipientEmails.push(e);
          }
        }
        break;
      }

      // ── Status Change (admin confirms/cancels) ────────────
      case "status_change": {
        const { parentId, parentName, parentEmail, childName, weekName, divisionName, newStatus } = data;
        emailContent = statusChangeEmail({
          parentName: parentName || "Camp Family",
          childName,
          weekName,
          divisionName,
          newStatus,
        });

        recipientEmails = [parentEmail];
        if (parentId) {
          const extras = await getEmailRecipients(parentId);
          for (const e of extras) {
            if (!recipientEmails.includes(e)) recipientEmails.push(e);
          }
        }
        break;
      }

      // ── Shirt Order Confirmation ──────────────────────────
      case "shirt_order": {
        const { parentEmail, parentName, amountCents, items } = data;
        emailContent = shirtOrderReceiptEmail({
          parentName: parentName || "Camp Family",
          amountCents,
          items,
        });
        recipientEmails = [parentEmail];
        break;
      }

      // ── Waitlist Confirmation ─────────────────────────────
      case "waitlist_confirmation": {
        const { parentId, parentEmail, parentName, childName, className, divisionName, weeks } = data;
        emailContent = waitlistConfirmationEmail({
          parentName: parentName || "Camp Family",
          childName,
          className,
          divisionName,
          weeks: weeks || [],
        });
        recipientEmails = [parentEmail];
        if (parentId) {
          const extras = await getEmailRecipients(parentId);
          for (const e of extras) {
            if (!recipientEmails.includes(e)) recipientEmails.push(e);
          }
        }
        break;
      }

      // ── Waitlist Approved ─────────────────────────────────
      case "waitlist_approved": {
        const { parentId, parentEmail, parentName, childName, className, divisionName, weekName, priceCents } = data;
        emailContent = waitlistApprovedEmail({
          parentName: parentName || "Camp Family",
          childName,
          className,
          divisionName,
          weekName,
          priceCents,
        });
        recipientEmails = [parentEmail];
        if (parentId) {
          const extras = await getEmailRecipients(parentId);
          for (const e of extras) {
            if (!recipientEmails.includes(e)) recipientEmails.push(e);
          }
        }
        break;
      }

      default:
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: `Unknown email type: ${type}` }),
        };
    }

    recipientEmails = recipientEmails.filter(Boolean);

    if (recipientEmails.length === 0) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "No valid email recipients" }),
      };
    }

    const result = await sendEmail({
      to: recipientEmails,
      subject: emailContent.subject,
      html: emailContent.html,
    });

    return {
      statusCode: result.success ? 200 : 500,
      headers: corsHeaders,
      body: JSON.stringify(result),
    };
  } catch (err) {
    console.error("send-email error:", err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message }),
    };
  }
};