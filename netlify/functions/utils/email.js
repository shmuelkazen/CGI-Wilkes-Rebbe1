// ═══════════════════════════════════════════════════════════════
// CGI Wilkes Rebbe — Email Utility (Resend API)
// Shared module used by all email-sending functions
// ═══════════════════════════════════════════════════════════════

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || "onboarding@resend.dev";
const CAMP_NAME = "CGI Wilkes Rebbe";
const SITE_URL = process.env.SITE_URL || "https://cgikingston.com";
const LOGO_URL = process.env.CAMP_LOGO_URL || `${SITE_URL}/logo.png`;
const REGISTER_URL = "https://register.cgikingston.com";

// ── Send via Resend API ──────────────────────────────────────
async function sendEmail({ to, subject, html, replyTo }) {
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set — skipping email send");
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  const recipients = Array.isArray(to) ? to : [to];

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `${CAMP_NAME} <${FROM_EMAIL}>`,
        to: recipients,
        subject,
        html,
        reply_to: replyTo || "kingstoncgi@gmail.com",

      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Resend API error:", err);
      return { success: false, error: err };
    }

    const data = await res.json();
    console.log(`Email sent: "${subject}" to ${recipients.join(", ")} — id: ${data.id}`);
    return { success: true, id: data.id };
  } catch (err) {
    console.error("Email send failed:", err);
    return { success: false, error: err.message };
  }
}

// ── HTML Email Wrapper ───────────────────────────────────────
function wrapEmail(bodyContent) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${CAMP_NAME}</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f7f4; font-family: Georgia, 'Times New Roman', serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7f4;">
    <tr>
      <td align="center" style="padding: 24px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background: linear-gradient(135deg, #1a5c2e 0%, #2d7a45 100%); padding: 28px 32px; text-align:center;">
              <p style="margin:0 0 10px; text-align:right; color:#ffffff; font-size:15px; font-weight:bold; font-family: Georgia, 'Times New Roman', serif;">בס״ד</p>
              <img src="${LOGO_URL}" alt="${CAMP_NAME}" width="80" height="80" style="display:block; margin: 0 auto 12px; border-radius:50%; border: 3px solid rgba(255,255,255,0.3);" onerror="this.style.display='none'">
              <h1 style="margin:0; color:#ffffff; font-size:24px; font-weight:700; letter-spacing:0.5px; font-family: Georgia, 'Times New Roman', serif;">
                ${CAMP_NAME}
              </h1>
              <p style="margin:4px 0 0; color:rgba(255,255,255,0.8); font-size:13px; letter-spacing:1px; text-transform:uppercase;">
                Summer Camp
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              ${bodyContent}
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px; background-color:#f8faf8; border-top: 1px solid #e8ede8; text-align:center;">
              <p style="margin:0 0 4px; color:#6b7b6b; font-size:12px;">
                ${CAMP_NAME} &bull; Kingston, PA
              </p>
              <p style="margin:0; color:#6b7b6b; font-size:12px;">
                <a href="${SITE_URL}" style="color:#2d7a45; text-decoration:none;">cgikingston.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Reusable HTML Pieces ─────────────────────────────────────
const styles = {
  heading: 'style="margin:0 0 16px; color:#1a3a1a; font-size:20px; font-weight:700;"',
  text: 'style="margin:0 0 12px; color:#374737; font-size:15px; line-height:1.6;"',
  muted: 'style="margin:0 0 12px; color:#6b7b6b; font-size:13px; line-height:1.5;"',
  table: 'style="width:100%; border-collapse:collapse; margin:16px 0;"',
  th: 'style="text-align:left; padding:8px 12px; background-color:#f0f5f0; border-bottom:2px solid #d0ddd0; color:#1a3a1a; font-size:13px; font-weight:600;"',
  td: 'style="padding:8px 12px; border-bottom:1px solid #e8ede8; color:#374737; font-size:14px;"',
  badge: (color) => `style="display:inline-block; padding:3px 10px; border-radius:12px; font-size:12px; font-weight:600; background-color:${color === 'green' ? '#e6f4ea' : color === 'yellow' ? '#fff8e1' : color === 'red' ? '#fde8e8' : '#e8eef4'}; color:${color === 'green' ? '#1a5c2e' : color === 'yellow' ? '#8a6d00' : color === 'red' ? '#991b1b' : '#1a3a6e'};"`,
  button: 'style="display:inline-block; padding:12px 28px; background-color:#2d7a45; color:#ffffff; text-decoration:none; border-radius:8px; font-size:15px; font-weight:600; margin:16px 0;"',
};

function formatCents(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// ═══════════════════════════════════════════════════════════════
// EMAIL TEMPLATES
// ═══════════════════════════════════════════════════════════════

function registrationConfirmationEmail({ parentName, children, totalDue, registrationFeePaid }) {
  let childRows = "";
  for (const child of children) {
    const weeksList = child.weeks.join(", ");
    childRows += `
      <tr>
        <td ${styles.td}><strong>${child.name}</strong></td>
        <td ${styles.td}>${child.division}</td>
        <td ${styles.td}>${weeksList}</td>
      </tr>`;
  }

  const feeNote = registrationFeePaid
    ? `<span ${styles.badge("green")}>Paid</span>`
    : `<span ${styles.badge("yellow")}>Due</span>`;

  const body = `
    <h2 ${styles.heading}>Registration Received!</h2>
    <p ${styles.text}>Hi ${parentName},</p>
    <p ${styles.text}>Thank you for registering for ${CAMP_NAME}! Here's a summary of your registration:</p>
    <table ${styles.table}>
      <thead>
        <tr>
          <th ${styles.th}>Child</th>
          <th ${styles.th}>Division</th>
          <th ${styles.th}>Weeks</th>
        </tr>
      </thead>
      <tbody>${childRows}</tbody>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
      <tr>
        <td style="padding:12px 16px; background-color:#f0f5f0; border-radius:8px;">
          <p style="margin:0 0 4px; color:#1a3a1a; font-size:14px;">
            <strong>Registration Fee ($45):</strong> ${feeNote}
          </p>
          <p style="margin:0; color:#1a3a1a; font-size:14px;">
            <strong>Camp Balance:</strong> ${formatCents(totalDue)}
          </p>
        </td>
      </tr>
    </table>
    <p ${styles.text}>Your registration is pending until payment is received. You can pay online anytime:</p>
    <p style="text-align:center;">
      <a href="${SITE_URL}" ${styles.button}>Pay Now &rarr;</a>
    </p>
    <p ${styles.muted}>If you have any questions, reply to this email and we'll get back to you.</p>
  `;

  return {
    subject: `${CAMP_NAME} — Registration Confirmation`,
    html: wrapEmail(body),
  };
}

function paymentReceiptEmail({ parentName, amountCents, totalDueCents, totalPaidCents, paymentMethod, children }) {
  const balanceRemaining = totalDueCents - totalPaidCents;
  const balanceColor = balanceRemaining <= 0 ? "green" : "yellow";
  const balanceText = balanceRemaining <= 0 ? "Paid in Full" : formatCents(balanceRemaining) + " remaining";

  let childSummary = "";
  if (children && children.length > 0) {
    childSummary = `<p ${styles.muted}>Registered campers: ${children.map(c => c.name).join(", ")}</p>`;
  }

  const body = `
    <h2 ${styles.heading}>Payment Received — Thank You!</h2>
    <p ${styles.text}>Hi ${parentName},</p>
    <p ${styles.text}>We've received your payment. Here are the details:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
      <tr>
        <td style="padding:16px; background-color:#e6f4ea; border-radius:8px; border: 1px solid #c8e6c9;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="color:#1a5c2e; font-size:14px; padding:4px 0;"><strong>Amount Paid:</strong></td>
              <td style="color:#1a5c2e; font-size:20px; font-weight:700; text-align:right;">${formatCents(amountCents)}</td>
            </tr>
            <tr>
              <td style="color:#374737; font-size:13px; padding:4px 0;">Payment Method:</td>
              <td style="color:#374737; font-size:13px; text-align:right;">${paymentMethod || "Credit Card"}</td>
            </tr>
            <tr>
              <td style="color:#374737; font-size:13px; padding:4px 0;">Date:</td>
              <td style="color:#374737; font-size:13px; text-align:right;">${formatDate(new Date().toISOString())}</td>
            </tr>
            <tr><td colspan="2" style="padding:8px 0 0;"><hr style="border:none; border-top:1px solid #c8e6c9;"></td></tr>
            <tr>
              <td style="color:#374737; font-size:13px; padding:4px 0;">Total Due:</td>
              <td style="color:#374737; font-size:13px; text-align:right;">${formatCents(totalDueCents)}</td>
            </tr>
            <tr>
              <td style="color:#374737; font-size:13px; padding:4px 0;">Total Paid:</td>
              <td style="color:#374737; font-size:13px; text-align:right;">${formatCents(totalPaidCents)}</td>
            </tr>
            <tr>
              <td style="color:#1a3a1a; font-size:14px; font-weight:600; padding:4px 0;">Balance:</td>
              <td style="text-align:right;"><span ${styles.badge(balanceColor)}>${balanceText}</span></td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    ${childSummary}
    <p ${styles.text}>You can view your account anytime at <a href="${SITE_URL}" style="color:#2d7a45;">${SITE_URL}</a></p>
    <p ${styles.muted}>This is your receipt. No further action is needed${balanceRemaining > 0 ? " for this payment" : ""}.</p>
  `;

  return {
    subject: `${CAMP_NAME} — Payment Receipt (${formatCents(amountCents)})`,
    html: wrapEmail(body),
  };
}

function registrationFeeReceiptEmail({ parentName }) {
  const body = `
    <h2 ${styles.heading}>Registration Fee Received</h2>
    <p ${styles.text}>Hi ${parentName},</p>
    <p ${styles.text}>We've received your $45 registration fee. You can now register your child(ren) for camp sessions at ${CAMP_NAME}!</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
      <tr>
        <td style="padding:12px 16px; background-color:#e6f4ea; border-radius:8px; border: 1px solid #c8e6c9;">
          <p style="margin:0; color:#1a5c2e; font-size:15px;">
            &#10003; <strong>Registration Fee:</strong> $45.00 — Paid
          </p>
        </td>
      </tr>
    </table>
    <p ${styles.text}>Next step: select your weeks and complete your camp payment.</p>
    <p style="text-align:center;">
      <a href="${SITE_URL}" ${styles.button}>Go to Registration &rarr;</a>
    </p>
    <p ${styles.muted}>If you have any questions, reply to this email.</p>
  `;

  return {
    subject: `${CAMP_NAME} — Registration Fee Receipt`,
    html: wrapEmail(body),
  };
}

function statusChangeEmail({ parentName, childName, weekName, divisionName, newStatus }) {
  const isConfirmed = newStatus === "confirmed";
  const statusBadge = isConfirmed
    ? `<span ${styles.badge("green")}>Confirmed</span>`
    : `<span ${styles.badge("red")}>Cancelled</span>`;

  const message = isConfirmed
    ? `Great news! The registration for <strong>${childName}</strong> in <strong>${divisionName}</strong> — <strong>${weekName}</strong> has been confirmed.`
    : `The registration for <strong>${childName}</strong> in <strong>${divisionName}</strong> — <strong>${weekName}</strong> has been cancelled. If you believe this is an error, please contact us.`;

  const body = `
    <h2 ${styles.heading}>Registration Update</h2>
    <p ${styles.text}>Hi ${parentName},</p>
    <p ${styles.text}>${message}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
      <tr>
        <td style="padding:12px 16px; background-color:#f0f5f0; border-radius:8px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="color:#374737; font-size:14px; padding:4px 0;"><strong>Camper:</strong></td>
              <td style="color:#374737; font-size:14px; text-align:right;">${childName}</td>
            </tr>
            <tr>
              <td style="color:#374737; font-size:14px; padding:4px 0;"><strong>Division:</strong></td>
              <td style="color:#374737; font-size:14px; text-align:right;">${divisionName}</td>
            </tr>
            <tr>
              <td style="color:#374737; font-size:14px; padding:4px 0;"><strong>Week:</strong></td>
              <td style="color:#374737; font-size:14px; text-align:right;">${weekName}</td>
            </tr>
            <tr>
              <td style="color:#374737; font-size:14px; padding:4px 0;"><strong>Status:</strong></td>
              <td style="text-align:right;">${statusBadge}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    <p style="text-align:center;">
      <a href="${SITE_URL}" ${styles.button}>View My Account &rarr;</a>
    </p>
    <p ${styles.muted}>If you have any questions, reply to this email.</p>
  `;

  return {
    subject: `${CAMP_NAME} — Registration ${isConfirmed ? "Confirmed" : "Cancelled"}: ${childName}`,
    html: wrapEmail(body),
  };
}

function shirtOrderReceiptEmail({ parentName, amountCents, items }) {
  let itemRows = "";
  if (items && items.length > 0) {
    for (const item of items) {
      itemRows += `
        <tr>
          <td ${styles.td}>${item.size}</td>
          <td ${styles.td}>${item.quantity}</td>
          <td ${styles.td}>${formatCents(item.priceEach)}</td>
        </tr>`;
    }
  }

  const body = `
    <h2 ${styles.heading}>T-Shirt Order Confirmed!</h2>
    <p ${styles.text}>Hi ${parentName},</p>
    <p ${styles.text}>Your camp t-shirt order has been received and paid.</p>
    ${itemRows ? `
    <table ${styles.table}>
      <thead>
        <tr>
          <th ${styles.th}>Size</th>
          <th ${styles.th}>Qty</th>
          <th ${styles.th}>Price</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>` : ""}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
      <tr>
        <td style="padding:12px 16px; background-color:#e6f4ea; border-radius:8px;">
          <p style="margin:0; color:#1a5c2e; font-size:15px;">
            <strong>Total Paid:</strong> ${formatCents(amountCents)}
          </p>
        </td>
      </tr>
    </table>
    <p ${styles.muted}>Shirts will be distributed at camp. If you have questions, reply to this email.</p>
  `;

  return {
    subject: `${CAMP_NAME} — T-Shirt Order Confirmation`,
    html: wrapEmail(body),
  };
}

// ── Waitlist Confirmation (sent to parent when child lands on waitlist) ──
function waitlistConfirmationEmail({ parentName, childName, className, divisionName, weeks }) {
  const weekList = (weeks || []).map((w) => `<li style="padding:4px 0; color:#374737; font-size:14px;">${w}</li>`).join("");

  const body = `
    <h2 ${styles.heading}>Waitlist Confirmation</h2>
    <p ${styles.text}>Hi ${parentName},</p>
    <p ${styles.text}>Thank you for your interest in ${CAMP_NAME}! The <strong>${className}</strong> class in <strong>${divisionName}</strong> is currently at capacity for the following week${weeks.length !== 1 ? "s" : ""}:</p>
    <ul style="margin:12px 0 12px 20px; padding:0;">${weekList}</ul>
    <p ${styles.text}><strong>${childName}</strong> has been placed on the waitlist. We will notify you by email as soon as a spot becomes available.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
      <tr>
        <td style="padding:12px 16px; background-color:#fff8e1; border-radius:8px; border: 1px solid #ffe082;">
          <p style="margin:0; color:#8a6d00; font-size:14px;">
            <strong>No payment is required at this time.</strong> You will only be asked to pay once a spot is confirmed.
          </p>
        </td>
      </tr>
    </table>
    <p ${styles.muted}>If you have any questions, reply to this email and we'll get back to you.</p>
  `;

  return {
    subject: `${CAMP_NAME} — Waitlist Confirmation: ${childName}`,
    html: wrapEmail(body),
  };
}

// ── Waitlist Approved (sent to parent when admin approves from waitlist) ──
function waitlistApprovedEmail({ parentName, childName, className, divisionName, weeks, totalCents }) {
  const weekRows = (weeks || []).map((w) => `
    <tr>
      <td style="padding:6px 12px; color:#374737; font-size:14px; border-bottom:1px solid #e8ede8;">${w.name}</td>
      <td style="padding:6px 12px; color:#374737; font-size:14px; text-align:right; border-bottom:1px solid #e8ede8;">${formatCents(w.priceCents)}</td>
    </tr>`).join("");

  const body = `
    <h2 ${styles.heading}>${weeks.length === 1 ? "A Spot Has Opened!" : "Spots Have Opened!"}</h2>
    <p ${styles.text}>Hi ${parentName},</p>
    <p ${styles.text}>Great news! ${weeks.length === 1 ? "A spot has" : "Spots have"} become available for <strong>${childName}</strong> in the <strong>${className}</strong> class.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
      <tr>
        <td style="padding:16px; background-color:#e6f4ea; border-radius:8px; border: 1px solid #c8e6c9;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="color:#1a5c2e; font-size:14px; padding:4px 0;"><strong>Camper:</strong></td>
              <td style="color:#1a5c2e; font-size:14px; text-align:right;">${childName}</td>
            </tr>
            <tr>
              <td style="color:#374737; font-size:14px; padding:4px 0;"><strong>Division:</strong></td>
              <td style="color:#374737; font-size:14px; text-align:right;">${divisionName}</td>
            </tr>
            <tr>
              <td style="color:#374737; font-size:14px; padding:4px 0;"><strong>Class:</strong></td>
              <td style="color:#374737; font-size:14px; text-align:right;">${className}</td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px; border-top:1px solid #c8e6c9; padding-top:8px;">
            <thead><tr>
              <th style="text-align:left; padding:6px 12px; color:#1a5c2e; font-size:12px; font-weight:600;">Week</th>
              <th style="text-align:right; padding:6px 12px; color:#1a5c2e; font-size:12px; font-weight:600;">Amount</th>
            </tr></thead>
            <tbody>${weekRows}</tbody>
            ${totalCents ? `<tfoot><tr>
              <td style="padding:8px 12px; font-size:14px; font-weight:700; color:#1a5c2e;">Total Due</td>
              <td style="padding:8px 12px; font-size:14px; font-weight:700; color:#1a5c2e; text-align:right;">${formatCents(totalCents)}</td>
            </tr></tfoot>` : ""}
          </table>
        </td>
      </tr>
    </table>
    <p ${styles.text}>Please log in to complete your payment and secure ${weeks.length === 1 ? "this spot" : "these spots"}:</p>
    <p style="text-align:center;">
      <a href="${SITE_URL}" ${styles.button}>Complete Payment &rarr;</a>
    </p>
    <p ${styles.muted}>If you have any questions, reply to this email.</p>
  `;

  return {
    subject: `${CAMP_NAME} — ${weeks.length === 1 ? "Spot" : "Spots"} Available for ${childName}!`,
    html: wrapEmail(body),
  };
}

// ═══════════════════════════════════════════════════════════════
// REMINDER TEMPLATES
// ═══════════════════════════════════════════════════════════════

// ── Complete Registration Reminder (paid reg fee but no weeks selected) ──
function completeRegistrationReminderEmail({ parentName }) {
  const body = `
    <h2 ${styles.heading}>Complete Your Registration</h2>
    <p ${styles.text}>Hi ${parentName},</p>
    <p ${styles.text}>Thank you for starting the registration process and paying the registration fee!</p>
    <p ${styles.text}>We noticed that you haven't yet selected weeks for your child(ren). Please log back in, choose which weeks you'd like to register for, and complete your payment.</p>
    <p ${styles.text}>Please note that the early bird rate is available when paid in full by 10 Sivan (May 26th). After that date, pricing will increase.</p>
    <p style="text-align:center;">
      <a href="${REGISTER_URL}" ${styles.button}>Log In to Complete Registration &rarr;</a>
    </p>
  `;

  return {
    subject: `${CAMP_NAME} — Complete Your Registration — Select Your Weeks`,
    html: wrapEmail(body),
  };
}

// ── Balance Reminder (registered but outstanding balance) ──
function balanceReminderEmail({ parentName, balanceCents }) {
  const body = `
    <h2 ${styles.heading}>Outstanding Balance</h2>
    <p ${styles.text}>Hi ${parentName},</p>
    <p ${styles.text}>Thank you for registering for ${CAMP_NAME}!</p>
    <p ${styles.text}>Your registration is complete, but you have an outstanding balance of <strong>${formatCents(balanceCents)}</strong>. This total reflects the early bird rate, which is available when paid in full by 10 Sivan (May 26th). After that date, pricing will increase.</p>
    <p ${styles.text}>Please note that in order to attend camp, payment must be completed or a payment plan must be in place with Rabbi Green.</p>
    <p style="text-align:center;">
      <a href="${REGISTER_URL}" ${styles.button}>Log In to Pay &rarr;</a>
    </p>
  `;

  return {
    subject: `${CAMP_NAME} — Complete Your Payment — Outstanding Balance`,
    html: wrapEmail(body),
  };
}

module.exports = {
  sendEmail,
  wrapEmail,
  formatCents,
  formatDate,
  registrationConfirmationEmail,
  paymentReceiptEmail,
  registrationFeeReceiptEmail,
  statusChangeEmail,
  shirtOrderReceiptEmail,
  waitlistConfirmationEmail,
  waitlistApprovedEmail,
  completeRegistrationReminderEmail,
  balanceReminderEmail,
  CAMP_NAME,
  SITE_URL,
};