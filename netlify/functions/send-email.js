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
  // Returns the parent's auth email + any additional recipients from children
  async function getEmailRecipients(parentId) {
    const recipients = new Set();
  
    // Get parent's auth email from Supabase auth.users via profiles or auth_email
    // We'll look up the parent profile which has the email
    try {
      const profiles = await supabaseQuery("parent_profiles", {
        filters: `&id=eq.${parentId}`,
        select: "email,full_name",
      });
      if (profiles && profiles[0]?.email) {
        recipients.add(profiles[0].email);
      }
    } catch (e) {
      console.warn("Could not fetch parent profile email:", e.message);
    }
  
    // Check for additional email recipients on children
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
      // additional_email column may not exist — that's fine
      console.warn("Could not fetch additional emails:", e.message);
    }
  
    return [...recipients];
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
  
          // Send to provided email + any additional recipients
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
  
        default:
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: `Unknown email type: ${type}` }),
          };
      }
  
      // Filter out empty/null emails
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