const nodemailer = require("nodemailer");
const env = require("../config/env");

let transporter;

function smtpConfigured() {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

function resendConfigured() {
  return Boolean(env.RESEND_API_KEY);
}

function getTransporter() {
  if (!smtpConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
      tls: {
        minVersion: "TLSv1.2",
      },
    });
  }
  return transporter;
}

function getAppBaseUrl(appBaseUrl) {
  if (appBaseUrl) return String(appBaseUrl).replace(/\/$/, "");
  const base = (env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  return base;
}

function buildAbsoluteUrl(path, appBaseUrl) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${getAppBaseUrl(appBaseUrl)}${normalized}`;
}

function resolveMailTarget(to) {
  if (env.MAIL_TEST_REDIRECT && env.MAIL_TEST_TO && env.NODE_ENV !== "production") {
    return { to: env.MAIL_TEST_TO, originalTo: to };
  }
  return { to, originalTo: null };
}

async function sendViaSmtp({ to, subject, text, html }) {
  const transport = getTransporter();
  if (!transport) return false;

  await transport.sendMail({
    from: env.MAIL_FROM,
    to,
    subject,
    text,
    html,
  });
  return true;
}

async function sendViaResend({ to, subject, text, html }) {
  if (!env.RESEND_API_KEY) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [to],
      subject,
      text,
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 403 && body.includes("resend.dev")) {
      throw new Error(
        "Resend test sender (onboarding@resend.dev) can only deliver to your Resend account email. Verify a domain at resend.com/domains and set MAIL_FROM to that domain.",
      );
    }
    throw new Error(`Resend API error (${res.status}): ${body}`);
  }
  return true;
}

/**
 * Sends transactional email.
 * MAIL_PROVIDER: auto (Resend then SMTP), smtp (nodemailer only), resend (API only).
 */
async function sendMail({ to, subject, text, html }) {
  const { to: recipient, originalTo } = resolveMailTarget(to);
  const devNote = originalTo
    ? `\n\n[Development] This message was originally addressed to ${originalTo}.`
    : "";
  const devHtml = originalTo
    ? `<p style="color:#66736B;font-size:12px;">[Development] Originally addressed to ${originalTo}.</p>`
    : "";
  const finalSubject = originalTo ? `[DEV] ${subject}` : subject;
  const finalText = `${text}${devNote}`;
  const finalHtml = html ? `${html}${devHtml}` : undefined;

  const providers =
    env.MAIL_PROVIDER === "smtp"
      ? ["smtp"]
      : env.MAIL_PROVIDER === "resend"
        ? ["resend"]
        : ["resend", "smtp"];

  for (const provider of providers) {
    if (provider === "resend" && resendConfigured()) {
      await sendViaResend({ to: recipient, subject: finalSubject, text: finalText, html: finalHtml });
      return { sent: true, provider: "resend", to: recipient, originalTo };
    }
    if (provider === "smtp" && smtpConfigured()) {
      await sendViaSmtp({ to: recipient, subject: finalSubject, text: finalText, html: finalHtml });
      return { sent: true, provider: "smtp", to: recipient, originalTo };
    }
  }

  console.log("[mail] (not sent — configure RESEND_API_KEY or SMTP_HOST/SMTP_USER/SMTP_PASS)");
  console.log(`[mail] Provider preference: ${env.MAIL_PROVIDER}`);
  console.log(`[mail] To: ${recipient}${originalTo ? ` (intended: ${originalTo})` : ""}`);
  console.log(`[mail] Subject: ${finalSubject}`);
  console.log(`[mail] Body:\n${finalText}`);
  return { sent: false, provider: "log", to: recipient, originalTo };
}

async function sendRegistrationActivationEmail({ to, contactName, orgName, activationUrl, appBaseUrl }) {
  const loginUrl = buildAbsoluteUrl("/login", appBaseUrl);
  const subject = `Activate your ${orgName} workspace on CropFort`;
  const text = [
    `Hello ${contactName},`,
    "",
    `SPX has approved your registration for ${orgName}.`,
    "",
    "Activate your account (set your password):",
    activationUrl,
    "",
    `After activation, sign in at: ${loginUrl}`,
    "",
    "This activation link expires in 14 days.",
    "",
    "- CropFort / SPX Africa",
  ].join("\n");

  const html = `
    <div style="font-family:Manrope,Arial,sans-serif;line-height:1.6;color:#17201B;max-width:560px;">
      <p>Hello ${contactName},</p>
      <p>SPX has approved your registration for <strong>${orgName}</strong>.</p>
      <p>
        <a href="${activationUrl}" style="display:inline-block;background:#3A6B35;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">
          Activate your account
        </a>
      </p>
      <p style="font-size:14px;color:#66736B;">Or copy this link:<br /><a href="${activationUrl}">${activationUrl}</a></p>
      <p>After activation, sign in at <a href="${loginUrl}">${loginUrl}</a>.</p>
      <p style="color:#66736B;font-size:13px;">This link expires in 14 days.</p>
      <p style="color:#66736B;font-size:13px;">- CropFort / SPX Africa</p>
    </div>
  `;

  return sendMail({ to, subject, text, html });
}

function formatRoleLabel(role) {
  return String(role || "")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function transactionalEmailLayout({ preheader, title, bodyHtml, ctaLabel, ctaUrl, footerNote, loginUrl }) {
  const signInUrl = loginUrl || buildAbsoluteUrl("/login");
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f4f6f4;font-family:Manrope,Arial,sans-serif;color:#17201B;">
  <span style="display:none;max-height:0;overflow:hidden;">${preheader}</span>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f4;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8e4;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:24px 28px;background:#3A6B35;color:#ffffff;">
              <p style="margin:0;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.9;">CropFort</p>
              <h1 style="margin:8px 0 0;font-size:22px;line-height:1.3;font-weight:700;">${title}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;font-size:15px;line-height:1.65;">
              ${bodyHtml}
              <p style="margin:28px 0 0;text-align:center;">
                <a href="${ctaUrl}" style="display:inline-block;background:#3A6B35;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;font-size:15px;">
                  ${ctaLabel}
                </a>
              </p>
              <p style="margin:24px 0 0;font-size:13px;color:#66736B;">
                If the button does not work, copy and paste this link into your browser:
              </p>
              <p style="margin:8px 0 0;font-size:13px;word-break:break-all;">
                <a href="${ctaUrl}" style="color:#3A6B35;">${ctaUrl}</a>
              </p>
              <hr style="margin:28px 0;border:none;border-top:1px solid #e2e8e4;" />
              <p style="margin:0;font-size:13px;color:#66736B;">
                After you accept, sign in at
                <a href="${signInUrl}" style="color:#3A6B35;word-break:break-all;">${signInUrl}</a>
              </p>
              <p style="margin:12px 0 0;font-size:12px;color:#8a968f;">${footerNote}</p>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:12px;color:#8a968f;">SPX Secure Deal Room · CropFort</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendOrganizationInviteEmail({
  to,
  inviteeEmail,
  orgName,
  role,
  invitedByName,
  inviteUrl,
  appBaseUrl,
}) {
  const roleLabel = formatRoleLabel(role);
  const inviter = invitedByName || "SPX Africa";
  const subject = `Join ${orgName} on CropFort`;
  const text = [
    "CropFort — Team invitation",
    "",
    `You have been invited to join ${orgName}.`,
    "",
    `Organization: ${orgName}`,
    `Role: ${roleLabel}`,
    `Invited by: ${inviter}`,
    `Account email: ${inviteeEmail || to}`,
    "",
    "To get started:",
    "1. Open the invitation link below",
    "2. Set your name and password",
    "3. Sign in to CropFort",
    "",
    inviteUrl,
    "",
    `Sign in after accepting: ${buildAbsoluteUrl("/login", appBaseUrl)}`,
    "",
    "This invitation expires in 14 days.",
    "",
    "SPX Secure Deal Room · CropFort",
  ].join("\n");

  const bodyHtml = `
    <p style="margin:0 0 16px;">You have been invited to join <strong>${orgName}</strong> on CropFort.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;background:#f8faf8;border:1px solid #e2e8e4;border-radius:8px;">
      <tr><td style="padding:14px 16px;font-size:14px;"><strong>Organization</strong><br />${orgName}</td></tr>
      <tr><td style="padding:0 16px 14px;font-size:14px;"><strong>Role</strong><br />${roleLabel}</td></tr>
      <tr><td style="padding:0 16px 14px;font-size:14px;"><strong>Invited by</strong><br />${inviter}</td></tr>
      <tr><td style="padding:0 16px 14px;font-size:14px;"><strong>Account email</strong><br />${inviteeEmail || to}</td></tr>
    </table>
    <p style="margin:0;font-size:14px;color:#66736B;">
      Open the link below to accept the invitation and create your password.
    </p>
  `;

  const loginUrl = buildAbsoluteUrl("/login", appBaseUrl);
  const html = transactionalEmailLayout({
    preheader: `${inviter} invited you to join ${orgName} as ${roleLabel}.`,
    title: "You're invited",
    bodyHtml,
    ctaLabel: "Accept invitation",
    ctaUrl: inviteUrl,
    footerNote: "This invitation expires in 14 days. If you did not expect this email, you can ignore it.",
    loginUrl,
  });

  return sendMail({ to, subject, text, html });
}

module.exports = {
  getAppBaseUrl,
  buildAbsoluteUrl,
  sendMail,
  sendRegistrationActivationEmail,
  sendOrganizationInviteEmail,
  smtpConfigured,
  resendConfigured,
};
