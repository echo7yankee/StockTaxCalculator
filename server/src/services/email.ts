import { recordCaughtError } from '../lib/errorMonitor.js';

const RESEND_API_URL = 'https://api.resend.com/emails';
const FROM_ADDRESS = 'InvesTax <noreply@investax.app>';

type Language = 'ro' | 'en';

interface ResendSendBody {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  reply_to?: string;
  headers?: Record<string, string>;
}

async function postToResend(body: ResendSendBody): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[Email] RESEND_API_KEY not set; outbound email skipped');
    } else {
      console.log('[Email][dev] would send:', body.subject, '->', body.to);
    }
    return;
  }

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const responseBody = await response.text().catch(() => '');
    const err = new Error(
      `Resend API ${response.status}: ${responseBody.slice(0, 500)}`
    );
    recordCaughtError(err, 'email.send');
    throw err;
  }
}

export interface PasswordResetEmailParams {
  to: string;
  resetUrl: string;
  language: Language;
}

export async function sendPasswordResetEmail(
  params: PasswordResetEmailParams
): Promise<void> {
  const { to, resetUrl, language } = params;
  const subject =
    language === 'ro'
      ? 'Resetare parolă InvesTax'
      : 'Reset your InvesTax password';

  await postToResend({
    from: FROM_ADDRESS,
    to,
    subject,
    html: language === 'ro' ? renderResetHtmlRo(resetUrl) : renderResetHtmlEn(resetUrl),
    text: language === 'ro' ? renderResetTextRo(resetUrl) : renderResetTextEn(resetUrl),
  });
}

export function pickLanguage(acceptLanguage: string | undefined): Language {
  if (!acceptLanguage) return 'ro';
  return acceptLanguage.toLowerCase().startsWith('en') ? 'en' : 'ro';
}

function renderResetHtmlRo(resetUrl: string): string {
  return `<!DOCTYPE html>
<html lang="ro">
<body style="font-family:system-ui,sans-serif;background:#f5f5f5;padding:24px;color:#0b1426;">
  <table cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;">
    <tr><td>
      <h1 style="margin:0 0 16px;font-size:20px;">Resetare parolă</h1>
      <p style="margin:0 0 16px;line-height:1.5;">Ai cerut resetarea parolei pentru contul tău InvesTax. Apasă butonul de mai jos pentru a seta o parolă nouă. Linkul expiră într-o oră.</p>
      <p style="margin:24px 0;">
        <a href="${resetUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;">Setează parola nouă</a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">Sau copiază acest link în browser:</p>
      <p style="margin:0 0 24px;font-size:13px;word-break:break-all;color:#374151;"><a href="${resetUrl}" style="color:#2563eb;">${resetUrl}</a></p>
      <p style="margin:0;font-size:13px;color:#6b7280;">Dacă nu ai cerut tu această resetare, poți ignora emailul. Parola actuală rămâne neschimbată.</p>
    </td></tr>
  </table>
  <p style="text-align:center;margin:16px 0 0;font-size:12px;color:#6b7280;">InvesTax · investax.app</p>
</body>
</html>`;
}

function renderResetHtmlEn(resetUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<body style="font-family:system-ui,sans-serif;background:#f5f5f5;padding:24px;color:#0b1426;">
  <table cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;">
    <tr><td>
      <h1 style="margin:0 0 16px;font-size:20px;">Reset your password</h1>
      <p style="margin:0 0 16px;line-height:1.5;">You requested a password reset for your InvesTax account. Click the button below to set a new password. The link expires in one hour.</p>
      <p style="margin:24px 0;">
        <a href="${resetUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;">Set new password</a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">Or copy this link into your browser:</p>
      <p style="margin:0 0 24px;font-size:13px;word-break:break-all;color:#374151;"><a href="${resetUrl}" style="color:#2563eb;">${resetUrl}</a></p>
      <p style="margin:0;font-size:13px;color:#6b7280;">If you didn't request this, you can ignore this email. Your current password is unchanged.</p>
    </td></tr>
  </table>
  <p style="text-align:center;margin:16px 0 0;font-size:12px;color:#6b7280;">InvesTax · investax.app</p>
</body>
</html>`;
}

function renderResetTextRo(resetUrl: string): string {
  return `Resetare parolă InvesTax

Ai cerut resetarea parolei pentru contul tău. Linkul expiră într-o oră:

${resetUrl}

Dacă nu ai cerut tu această resetare, ignoră emailul. Parola actuală rămâne neschimbată.

InvesTax · investax.app`;
}

function renderResetTextEn(resetUrl: string): string {
  return `Reset your InvesTax password

You requested a password reset. The link expires in one hour:

${resetUrl}

If you didn't request this, ignore this email. Your current password is unchanged.

InvesTax · investax.app`;
}

export interface WelcomeEmailParams {
  to: string;
  name: string | null;
  language: Language;
  clientUrl: string;
}

export async function sendWelcomeEmail(
  params: WelcomeEmailParams
): Promise<void> {
  const { to, name, language, clientUrl } = params;
  const subject =
    language === 'ro' ? 'Bun venit la InvesTax!' : 'Welcome to InvesTax!';

  await postToResend({
    from: FROM_ADDRESS,
    to,
    subject,
    html:
      language === 'ro'
        ? renderWelcomeHtmlRo(name, clientUrl)
        : renderWelcomeHtmlEn(name, clientUrl),
    text:
      language === 'ro'
        ? renderWelcomeTextRo(name, clientUrl)
        : renderWelcomeTextEn(name, clientUrl),
  });
}

function renderWelcomeHtmlRo(name: string | null, clientUrl: string): string {
  const greeting = name ? `Bun venit, ${escapeHtml(name)}!` : 'Bun venit!';
  return `<!DOCTYPE html>
<html lang="ro">
<body style="font-family:system-ui,sans-serif;background:#f5f5f5;padding:24px;color:#0b1426;">
  <table cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;">
    <tr><td>
      <h1 style="margin:0 0 16px;font-size:22px;">${greeting}</h1>
      <p style="margin:0 0 16px;line-height:1.5;">Contul tău InvesTax a fost creat cu succes. Ești gata să calculezi taxele pe câștigurile din investiții pentru anul fiscal 2025.</p>
      <p style="margin:0 0 16px;line-height:1.5;">Iată câteva locuri de unde poți începe:</p>
      <table cellpadding="0" cellspacing="0" style="margin:24px 0;width:100%;">
        <tr>
          <td style="padding:0 0 12px;">
            <a href="${clientUrl}/calculator" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;">Deschide calculatorul gratuit</a>
          </td>
        </tr>
        <tr>
          <td style="padding:0 0 12px;font-size:14px;">
            <a href="${clientUrl}/pricing" style="color:#2563eb;text-decoration:none;">Vezi planul anual cu reducere de lansare</a>
          </td>
        </tr>
        <tr>
          <td style="font-size:14px;">
            <a href="${clientUrl}/filing-guide" style="color:#2563eb;text-decoration:none;">Citește ghidul Declarația Unică</a>
          </td>
        </tr>
      </table>
      <p style="margin:24px 0 0;font-size:13px;color:#6b7280;">Întrebări? Scrie-ne la <a href="mailto:support@investax.app" style="color:#2563eb;">support@investax.app</a>. Răspundem în maxim 24 de ore în zilele lucrătoare.</p>
    </td></tr>
  </table>
  <p style="text-align:center;margin:16px 0 0;font-size:12px;color:#6b7280;">InvesTax · investax.app</p>
</body>
</html>`;
}

function renderWelcomeHtmlEn(name: string | null, clientUrl: string): string {
  const greeting = name ? `Welcome, ${escapeHtml(name)}!` : 'Welcome!';
  return `<!DOCTYPE html>
<html lang="en">
<body style="font-family:system-ui,sans-serif;background:#f5f5f5;padding:24px;color:#0b1426;">
  <table cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;">
    <tr><td>
      <h1 style="margin:0 0 16px;font-size:22px;">${greeting}</h1>
      <p style="margin:0 0 16px;line-height:1.5;">Your InvesTax account is ready. You can now calculate taxes on your investment gains for tax year 2025.</p>
      <p style="margin:0 0 16px;line-height:1.5;">Here are a few places to start:</p>
      <table cellpadding="0" cellspacing="0" style="margin:24px 0;width:100%;">
        <tr>
          <td style="padding:0 0 12px;">
            <a href="${clientUrl}/calculator" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;">Open the free calculator</a>
          </td>
        </tr>
        <tr>
          <td style="padding:0 0 12px;font-size:14px;">
            <a href="${clientUrl}/pricing" style="color:#2563eb;text-decoration:none;">See the annual plan with launch discount</a>
          </td>
        </tr>
        <tr>
          <td style="font-size:14px;">
            <a href="${clientUrl}/filing-guide" style="color:#2563eb;text-decoration:none;">Read the Declarația Unică filing guide</a>
          </td>
        </tr>
      </table>
      <p style="margin:24px 0 0;font-size:13px;color:#6b7280;">Questions? Email us at <a href="mailto:support@investax.app" style="color:#2563eb;">support@investax.app</a>. We reply within 24 hours on business days.</p>
    </td></tr>
  </table>
  <p style="text-align:center;margin:16px 0 0;font-size:12px;color:#6b7280;">InvesTax · investax.app</p>
</body>
</html>`;
}

function renderWelcomeTextRo(name: string | null, clientUrl: string): string {
  const greeting = name ? `Bun venit, ${name}!` : 'Bun venit!';
  return `${greeting}

Contul tău InvesTax a fost creat cu succes. Ești gata să calculezi taxele pe câștigurile din investiții pentru anul fiscal 2025.

Locuri de unde poți începe:
- Calculator gratuit: ${clientUrl}/calculator
- Planul anual cu reducere de lansare: ${clientUrl}/pricing
- Ghidul Declarația Unică: ${clientUrl}/filing-guide

Întrebări? Scrie-ne la support@investax.app.

InvesTax · investax.app`;
}

function renderWelcomeTextEn(name: string | null, clientUrl: string): string {
  const greeting = name ? `Welcome, ${name}!` : 'Welcome!';
  return `${greeting}

Your InvesTax account is ready. You can now calculate taxes on your investment gains for tax year 2025.

Places to start:
- Free calculator: ${clientUrl}/calculator
- Annual plan with launch discount: ${clientUrl}/pricing
- Declarația Unică filing guide: ${clientUrl}/filing-guide

Questions? Email us at support@investax.app.

InvesTax · investax.app`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface PaymentConfirmationEmailParams {
  to: string;
  name: string | null;
  amountMinorUnits: number;
  currency: string;
  orderId: string;
  expiresAt: Date;
  language: Language;
  clientUrl: string;
}

export async function sendPaymentConfirmationEmail(
  params: PaymentConfirmationEmailParams
): Promise<void> {
  const { to, name, amountMinorUnits, currency, orderId, expiresAt, language, clientUrl } =
    params;
  const subject =
    language === 'ro'
      ? 'Mulțumim pentru achiziție!'
      : 'Thanks for your purchase!';

  const amountFormatted = formatAmount(amountMinorUnits, currency);
  const expiresAtFormatted = expiresAt.toISOString().slice(0, 10);

  await postToResend({
    from: FROM_ADDRESS,
    to,
    subject,
    html:
      language === 'ro'
        ? renderConfirmationHtmlRo(name, amountFormatted, expiresAtFormatted, orderId, clientUrl)
        : renderConfirmationHtmlEn(name, amountFormatted, expiresAtFormatted, orderId, clientUrl),
    text:
      language === 'ro'
        ? renderConfirmationTextRo(name, amountFormatted, expiresAtFormatted, orderId, clientUrl)
        : renderConfirmationTextEn(name, amountFormatted, expiresAtFormatted, orderId, clientUrl),
  });
}

// Stripe amount_total is in the smallest currency unit (cents for EUR/USD/GBP).
// All InvesTax pricing is EUR-only at launch; this format works for any 2-decimal currency.
function formatAmount(amountMinorUnits: number, currency: string): string {
  const major = (amountMinorUnits / 100).toFixed(2);
  return `${major} ${currency.toUpperCase()}`;
}

function renderConfirmationHtmlRo(
  name: string | null,
  amount: string,
  expiresAt: string,
  orderId: string,
  clientUrl: string
): string {
  const greeting = name ? `Mulțumim, ${escapeHtml(name)}!` : 'Mulțumim!';
  return `<!DOCTYPE html>
<html lang="ro">
<body style="font-family:system-ui,sans-serif;background:#f5f5f5;padding:24px;color:#0b1426;">
  <table cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;">
    <tr><td>
      <h1 style="margin:0 0 16px;font-size:22px;">${greeting}</h1>
      <p style="margin:0 0 16px;line-height:1.5;">Plata ta a fost procesată cu succes. Acum ai acces complet la InvesTax pentru un an.</p>
      <table cellpadding="8" cellspacing="0" style="width:100%;background:#f8fafc;border-radius:6px;margin:0 0 24px;font-size:14px;">
        <tr><td style="color:#6b7280;">Plan</td><td style="text-align:right;">InvesTax Annual Access</td></tr>
        <tr><td style="color:#6b7280;">Sumă</td><td style="text-align:right;">${amount}</td></tr>
        <tr><td style="color:#6b7280;">Acces până la</td><td style="text-align:right;">${expiresAt}</td></tr>
        <tr><td style="color:#6b7280;">ID comandă</td><td style="text-align:right;font-family:monospace;font-size:12px;">${escapeHtml(orderId)}</td></tr>
      </table>
      <p style="margin:24px 0;">
        <a href="${clientUrl}/upload" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;">Încarcă extrasul tău anual</a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">Următorul pas: încarcă extrasul anual PDF de la Trading212 și primești în 2 minute toate cifrele de care ai nevoie pentru Declarația Unică.</p>
      <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">Vei primi separat o chitanță Stripe pentru această plată. Pentru orice întrebare, scrie-ne la <a href="mailto:support@investax.app" style="color:#2563eb;">support@investax.app</a>.</p>
    </td></tr>
  </table>
  <p style="text-align:center;margin:16px 0 0;font-size:12px;color:#6b7280;">InvesTax · investax.app</p>
</body>
</html>`;
}

function renderConfirmationHtmlEn(
  name: string | null,
  amount: string,
  expiresAt: string,
  orderId: string,
  clientUrl: string
): string {
  const greeting = name ? `Thank you, ${escapeHtml(name)}!` : 'Thank you!';
  return `<!DOCTYPE html>
<html lang="en">
<body style="font-family:system-ui,sans-serif;background:#f5f5f5;padding:24px;color:#0b1426;">
  <table cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;">
    <tr><td>
      <h1 style="margin:0 0 16px;font-size:22px;">${greeting}</h1>
      <p style="margin:0 0 16px;line-height:1.5;">Your payment has been processed successfully. You now have full access to InvesTax for one year.</p>
      <table cellpadding="8" cellspacing="0" style="width:100%;background:#f8fafc;border-radius:6px;margin:0 0 24px;font-size:14px;">
        <tr><td style="color:#6b7280;">Plan</td><td style="text-align:right;">InvesTax Annual Access</td></tr>
        <tr><td style="color:#6b7280;">Amount</td><td style="text-align:right;">${amount}</td></tr>
        <tr><td style="color:#6b7280;">Access until</td><td style="text-align:right;">${expiresAt}</td></tr>
        <tr><td style="color:#6b7280;">Order ID</td><td style="text-align:right;font-family:monospace;font-size:12px;">${escapeHtml(orderId)}</td></tr>
      </table>
      <p style="margin:24px 0;">
        <a href="${clientUrl}/upload" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;">Upload your annual statement</a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">Next step: upload your Trading212 annual PDF statement and get all the numbers you need for the Declarația Unică in two minutes.</p>
      <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">A separate Stripe receipt for this payment will arrive shortly. For any question, email us at <a href="mailto:support@investax.app" style="color:#2563eb;">support@investax.app</a>.</p>
    </td></tr>
  </table>
  <p style="text-align:center;margin:16px 0 0;font-size:12px;color:#6b7280;">InvesTax · investax.app</p>
</body>
</html>`;
}

function renderConfirmationTextRo(
  name: string | null,
  amount: string,
  expiresAt: string,
  orderId: string,
  clientUrl: string
): string {
  const greeting = name ? `Mulțumim, ${name}!` : 'Mulțumim!';
  return `${greeting}

Plata ta a fost procesată cu succes. Acum ai acces complet la InvesTax pentru un an.

Plan: InvesTax Annual Access
Sumă: ${amount}
Acces până la: ${expiresAt}
ID comandă: ${orderId}

Următorul pas: ${clientUrl}/upload. Încarcă extrasul anual PDF de la Trading212.

Vei primi separat o chitanță Stripe pentru această plată. Pentru orice întrebare, scrie-ne la support@investax.app.

InvesTax · investax.app`;
}

function renderConfirmationTextEn(
  name: string | null,
  amount: string,
  expiresAt: string,
  orderId: string,
  clientUrl: string
): string {
  const greeting = name ? `Thank you, ${name}!` : 'Thank you!';
  return `${greeting}

Your payment has been processed successfully. You now have full access to InvesTax for one year.

Plan: InvesTax Annual Access
Amount: ${amount}
Access until: ${expiresAt}
Order ID: ${orderId}

Next step: ${clientUrl}/upload. Upload your Trading212 annual PDF statement.

A separate Stripe receipt will arrive shortly. For any question, email us at support@investax.app.

InvesTax · investax.app`;
}

// ─── Admin notifications (operator-only, English, plain) ────────────────────
// Internal pings to ADMIN_NOTIFICATION_EMAIL when something operationally
// meaningful happens (new paying customer, contact-form submission). NOT
// customer-facing copy: deliberately plain, single language, easy to parse
// in an inbox.

export interface NewCustomerNotificationParams {
  customerEmail: string;
  customerName: string | null;
  amountMinorUnits: number;
  currency: string;
  stripeCustomerId: string | null;
  stripePaymentIntentId: string | null;
  orderId: string;
  planExpiresAt: Date;
  isLaunchPrice: boolean;
}

export async function sendNewCustomerNotification(
  params: NewCustomerNotificationParams
): Promise<void> {
  const adminTo = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!adminTo) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[Email] ADMIN_NOTIFICATION_EMAIL not set; admin payment notification skipped');
    }
    return;
  }

  const amount = formatAmount(params.amountMinorUnits, params.currency);
  const tier = params.isLaunchPrice ? 'launch promo (€12)' : 'standard (€19)';
  const subject = `[InvesTax] New paying customer: ${params.customerEmail}`;

  const lines = [
    `New paying customer just completed checkout.`,
    ``,
    `Customer email: ${params.customerEmail}`,
    `Customer name:  ${params.customerName ?? '(not provided)'}`,
    `Amount:         ${amount}`,
    `Tier:           ${tier}`,
    `Access until:   ${params.planExpiresAt.toISOString().slice(0, 10)}`,
    ``,
    `Stripe customer ID:       ${params.stripeCustomerId ?? '(missing)'}`,
    `Stripe payment intent ID: ${params.stripePaymentIntentId ?? '(missing)'}`,
    `Checkout session ID:      ${params.orderId}`,
    ``,
    `Stripe dashboard: https://dashboard.stripe.com/customers/${params.stripeCustomerId ?? ''}`,
    ``,
    `Sent automatically from the InvesTax production server.`,
  ];

  await postToResend({
    from: FROM_ADDRESS,
    to: adminTo,
    subject,
    html: `<pre style="font-family:ui-monospace,monospace;font-size:13px;line-height:1.5;">${escapeHtml(lines.join('\n'))}</pre>`,
    text: lines.join('\n'),
  });
}

export interface AnalyticsDigestNotificationParams {
  subject: string;
  /** Pre-rendered plain-text digest body (analytics + errors rollup). */
  body: string;
}

// Operator weekly digest: the scheduled VPS cron (scripts/analytics-digest.ts
// run with --send) emails the analytics + error rollup to
// ADMIN_NOTIFICATION_EMAIL so the operator gets a recurring pulse without
// logging in. Operator-only, English, plain <pre> body. The script owns the
// formatting (reusing the report formatters); this just wraps + sends.
// Returns true if it sent, false if it skipped (admin email unset) so the
// caller can tell a real send from a silent no-op (a monitoring digest must not
// report success when nothing went out).
export async function sendAnalyticsDigestNotification(
  params: AnalyticsDigestNotificationParams
): Promise<boolean> {
  const adminTo = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!adminTo) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[Email] ADMIN_NOTIFICATION_EMAIL not set; analytics digest skipped');
    }
    return false;
  }

  await postToResend({
    from: FROM_ADDRESS,
    to: adminTo,
    subject: params.subject,
    html: `<pre style="font-family:ui-monospace,monospace;font-size:13px;line-height:1.5;white-space:pre-wrap;">${escapeHtml(params.body)}</pre>`,
    text: params.body,
  });
  return true;
}

export interface ContactMessageNotificationParams {
  fromName: string;
  fromEmail: string;
  topic: 'support' | 'general' | 'business';
  message: string;
  language: Language;
  ipAddress: string | null;
  userAgent: string | null;
}

export async function sendContactMessageNotification(
  params: ContactMessageNotificationParams
): Promise<void> {
  const adminTo = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!adminTo) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[Email] ADMIN_NOTIFICATION_EMAIL not set; contact-form notification skipped');
    }
    return;
  }

  const topicLabel: Record<typeof params.topic, string> = {
    support: 'Support',
    general: 'General inquiry',
    business: 'Business',
  };
  const subject = `[InvesTax] ${topicLabel[params.topic]} message from ${params.fromName} <${params.fromEmail}>`;

  const lines = [
    `New message submitted via the contact form.`,
    ``,
    `From:     ${params.fromName} <${params.fromEmail}>`,
    `Topic:    ${topicLabel[params.topic]}`,
    `Language: ${params.language}`,
    `IP:       ${params.ipAddress ?? '(unknown)'}`,
    `UA:       ${params.userAgent ?? '(unknown)'}`,
    ``,
    `--- Message ---`,
    params.message,
    `--- End message ---`,
    ``,
    `Reply directly to ${params.fromEmail} to respond.`,
  ];

  await postToResend({
    from: FROM_ADDRESS,
    to: adminTo,
    subject,
    html: `<pre style="font-family:ui-monospace,monospace;font-size:13px;line-height:1.5;white-space:pre-wrap;">${escapeHtml(lines.join('\n'))}</pre>`,
    text: lines.join('\n'),
    reply_to: params.fromEmail,
  });
}

export interface ParseSummary {
  buys?: number;
  sells?: number;
  dividends?: number;
  distributions?: number;
  skipped?: number;
  totalRows?: number;
  pages?: number;
  year?: number;
}

export interface ParseAlertNotificationParams {
  userEmail: string;
  userName: string | null;
  fileType: 'pdf' | 'csv';
  outcome: 'success' | 'warning' | 'error';
  fileName: string | null;
  errorMessage: string | null;
  warnings: string[];
  summary: ParseSummary;
}

// Operator alert fired when a paying customer parses a broker statement, so a
// parse failure or an invariant warning reaches the operator inbox in minutes
// instead of staying invisible until the customer complains.
export async function sendParseAlertNotification(
  params: ParseAlertNotificationParams
): Promise<void> {
  const adminTo = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!adminTo) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[Email] ADMIN_NOTIFICATION_EMAIL not set; parse alert skipped');
    }
    return;
  }

  const fileTypeLabel = params.fileType.toUpperCase();
  const outcomeLabel: Record<ParseAlertNotificationParams['outcome'], string> = {
    success: 'parsed OK',
    warning: 'parsed WITH WARNINGS',
    error: 'PARSE FAILED',
  };
  const subjectOutcome: Record<ParseAlertNotificationParams['outcome'], string> = {
    success: 'parsed OK',
    warning: 'parse warning',
    error: 'parse FAILED',
  };
  const subject = `[InvesTax] ${fileTypeLabel} ${subjectOutcome[params.outcome]} for ${params.userEmail}`;

  const lines = [
    `A paying customer just processed a statement upload.`,
    ``,
    `Outcome:  ${outcomeLabel[params.outcome]}`,
    `User:     ${params.userName ?? '(no name)'} <${params.userEmail}>`,
    `File:     ${params.fileName ?? '(no filename)'}  (${fileTypeLabel})`,
  ];
  if (typeof params.summary.year === 'number') {
    lines.push(`Tax year: ${params.summary.year}`);
  }

  const countKeys = [
    'buys', 'sells', 'dividends', 'distributions', 'skipped', 'totalRows', 'pages',
  ] as const;
  const countEntries = countKeys
    .filter((k) => typeof params.summary[k] === 'number')
    .map((k) => [k, params.summary[k] as number] as const);
  if (countEntries.length > 0) {
    lines.push(``, `Parsed counts:`);
    for (const [key, value] of countEntries) {
      lines.push(`  ${key.padEnd(14)}${value}`);
    }
  }

  if (params.warnings.length > 0) {
    lines.push(``, `Warnings (${params.warnings.length}):`);
    for (const w of params.warnings) {
      lines.push(`  - ${w}`);
    }
  }

  if (params.errorMessage) {
    lines.push(``, `Error:`, `  ${params.errorMessage}`);
  }

  lines.push(
    ``,
    `Reply directly to ${params.userEmail} to reach the customer.`,
    ``,
    `Sent automatically from the InvesTax production server.`,
  );

  await postToResend({
    from: FROM_ADDRESS,
    to: adminTo,
    subject,
    html: `<pre style="font-family:ui-monospace,monospace;font-size:13px;line-height:1.5;white-space:pre-wrap;">${escapeHtml(lines.join('\n'))}</pre>`,
    text: lines.join('\n'),
    reply_to: params.userEmail,
  });
}

export interface ErrorAlertNotificationParams {
  /** Error constructor name, already capped (e.g. 'TypeError'). */
  name: string;
  /** Normalized + PII-scrubbed message (never the raw message). */
  message: string;
  /** Origin of the error. */
  source: string;
  /** Already-sanitized context label, or null/undefined if none. */
  context: string | null | undefined;
  /** The grouping fingerprint. */
  fingerprint: string;
  /** When this fingerprint was first recorded. */
  firstSeen: Date;
  /** Scrubbed sample stack, or null/undefined if none. */
  sampleStack: string | null | undefined;
}

// Direct Resend POST for the error alert. DELIBERATELY does NOT go through
// postToResend: postToResend records a send failure via recordCaughtError ->
// recordError, which would close a loop here (a failed alert email becomes a new
// 'email.send' error -> new fingerprint -> another alert -> ...). This helper
// throws on failure; the public sendErrorAlertNotification swallows it locally
// with console.error only, so the alert channel never feeds back into recordError.
async function sendErrorAlertViaResend(adminTo: string, subject: string, body: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[Email] RESEND_API_KEY not set; error alert skipped');
    } else if (process.env.NODE_ENV !== 'test') {
      console.log('[Email][dev] would send error alert:', subject, '->', adminTo);
    }
    return;
  }

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: adminTo,
      subject,
      html: `<pre style="font-family:ui-monospace,monospace;font-size:13px;line-height:1.5;white-space:pre-wrap;">${escapeHtml(body)}</pre>`,
      text: body,
    } satisfies ResendSendBody),
  });

  if (!response.ok) {
    const responseBody = await response.text().catch(() => '');
    throw new Error(`Resend API ${response.status}: ${responseBody.slice(0, 500)}`);
  }
}

// Operator alert fired the FIRST time a given error fingerprint is recorded, so a
// brand-new crash reaches the inbox in real time instead of waiting for the weekly
// digest. Driven fire-and-forget from errorMonitor.recordError on the create path.
//
// Body carries ONLY the already-grouped, already-scrubbed fields (name, normalized
// message, source, context, fingerprint, firstSeen, scrubbed sampleStack); never
// raw input. Self-contained on failure: catches everything locally and logs with
// console.error, and does NOT route through postToResend / recordCaughtError, so a
// mail outage can never trigger a recordError -> alert -> fail -> recordError loop.
export async function sendErrorAlertNotification(
  params: ErrorAlertNotificationParams
): Promise<void> {
  try {
    const adminTo = process.env.ADMIN_NOTIFICATION_EMAIL;
    if (!adminTo) {
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[Email] ADMIN_NOTIFICATION_EMAIL not set; error alert skipped');
      }
      return;
    }

    const subject = `[InvesTax] New error (${params.source}): ${params.name}`;

    const lines = [
      `A new error fingerprint was just recorded (first occurrence of this issue).`,
      ``,
      `Name:        ${params.name}`,
      `Message:     ${params.message}`,
      `Source:      ${params.source}`,
      `Context:     ${params.context ?? '(none)'}`,
      `Fingerprint: ${params.fingerprint}`,
      `First seen:  ${params.firstSeen.toISOString()}`,
      ``,
      `--- Sample stack (scrubbed) ---`,
      params.sampleStack ?? '(no stack captured)',
      `--- End stack ---`,
      ``,
      `Run "npm run errors -w server" on the box for the full grouped list.`,
      ``,
      `Sent automatically from the InvesTax production server.`,
    ];

    await sendErrorAlertViaResend(adminTo, subject, lines.join('\n'));
  } catch (err) {
    // Swallow locally. NEVER rethrow and NEVER route through recordError /
    // recordCaughtError: this is the alert delivery channel itself, and a loop
    // here would be self-amplifying.
    console.error('[Email] failed to send error alert:', err);
  }
}

// ─── Audience capture (double opt-in subscribe) ─────────────────────────────
// Customer-facing emails for the off-season email-capture asset: a double
// opt-in confirm email and a "you're on the list" welcome carrying an
// unsubscribe link. RO/EN, same visual shell as the transactional emails above.

// One localized noun phrase describing what the subscriber signed up to receive.
// Written to slot into both "You asked for ___" and "you'll get ___".
function subscribeTopicLine(topic: string, language: Language): string {
  const ro: Record<string, string> = {
    filing_reminder:
      'un memento prin email când se deschide depunerea Declarației Unice pentru veniturile din 2026',
    broker_revolut: 'o notificare când suportul pentru extrasele Revolut iese din beta',
    broker_ibkr:
      'o notificare când suportul pentru extrasele Interactive Brokers (IBKR) iese din beta',
    prior_years:
      'noutăți despre regularizarea anilor trecuți (2023 și 2024 se pot calcula deja automat în InvesTax)',
  };
  const en: Record<string, string> = {
    filing_reminder: 'an email reminder when filing opens for the 2026 Declarația Unică',
    broker_revolut: 'a heads-up when Revolut statement support leaves beta',
    broker_ibkr: 'a heads-up when Interactive Brokers (IBKR) statement support leaves beta',
    prior_years:
      'updates on regularizing prior tax years (2023 and 2024 can already be computed automatically in InvesTax)',
  };
  const table = language === 'ro' ? ro : en;
  return table[topic] ?? (language === 'ro' ? 'o notificare când avem noutăți' : 'a heads-up when we have news');
}

export function renderSubscribeShellHtml(lang: Language, heading: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="${lang}">
<body style="font-family:system-ui,sans-serif;background:#f5f5f5;padding:24px;color:#0b1426;">
  <table cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;">
    <tr><td>
      <h1 style="margin:0 0 16px;font-size:20px;">${heading}</h1>
      ${bodyHtml}
    </td></tr>
  </table>
  <p style="text-align:center;margin:16px 0 0;font-size:12px;color:#6b7280;">InvesTax · investax.app</p>
</body>
</html>`;
}

export interface SubscribeConfirmEmailParams {
  to: string;
  confirmUrl: string;
  topic: string;
  language: Language;
}

// Double opt-in: a subscriber is only added to the list after clicking this link.
export async function sendSubscribeConfirmEmail(
  params: SubscribeConfirmEmailParams
): Promise<void> {
  const { to, confirmUrl, topic, language } = params;
  const topicLine = subscribeTopicLine(topic, language);
  const subject =
    language === 'ro' ? 'Confirmă abonarea la InvesTax' : 'Confirm your InvesTax subscription';
  const heading = language === 'ro' ? 'Mai e un pas' : 'One more step';
  const intro =
    language === 'ro'
      ? `Ai cerut ${topicLine}. Apasă butonul de mai jos ca să confirmi adresa de email.`
      : `You asked for ${topicLine}. Click the button below to confirm your email address.`;
  const button = language === 'ro' ? 'Confirmă abonarea' : 'Confirm subscription';
  const fallback =
    language === 'ro' ? 'Sau copiază acest link în browser:' : 'Or copy this link into your browser:';
  const ignore =
    language === 'ro'
      ? 'Dacă nu ai cerut tu asta, poți ignora emailul. Nu te adăugăm pe listă fără confirmare.'
      : "If you didn't request this, you can ignore this email. We won't add you to the list without confirmation.";

  const bodyHtml = `
      <p style="margin:0 0 16px;line-height:1.5;">${intro}</p>
      <p style="margin:24px 0;">
        <a href="${confirmUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;">${button}</a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">${fallback}</p>
      <p style="margin:0 0 24px;font-size:13px;word-break:break-all;color:#374151;"><a href="${confirmUrl}" style="color:#2563eb;">${confirmUrl}</a></p>
      <p style="margin:0;font-size:13px;color:#6b7280;">${ignore}</p>`;

  const text =
    language === 'ro'
      ? `Confirmă abonarea la InvesTax\n\nAi cerut ${topicLine}. Confirmă adresa de email accesând linkul:\n\n${confirmUrl}\n\nDacă nu ai cerut tu asta, ignoră emailul.\n\nInvesTax · investax.app`
      : `Confirm your InvesTax subscription\n\nYou asked for ${topicLine}. Confirm your email by visiting:\n\n${confirmUrl}\n\nIf you didn't request this, ignore this email.\n\nInvesTax · investax.app`;

  await postToResend({ from: FROM_ADDRESS, to, subject, html: renderSubscribeShellHtml(language, heading, bodyHtml), text });
}

export interface SubscribeWelcomeEmailParams {
  to: string;
  unsubscribeUrl: string;
  topic: string;
  language: Language;
}

// Sent once, right after the subscriber confirms. Carries the unsubscribe link.
export async function sendSubscribeWelcomeEmail(
  params: SubscribeWelcomeEmailParams
): Promise<void> {
  const { to, unsubscribeUrl, topic, language } = params;
  const topicLine = subscribeTopicLine(topic, language);
  const subject = language === 'ro' ? 'Ești pe listă' : "You're on the list";
  const heading = language === 'ro' ? 'Gata, ești pe listă' : "You're all set";
  const intro =
    language === 'ro'
      ? `Adresa ta e confirmată. Primești ${topicLine}, plus, din când în când, noutăți scurte despre InvesTax.`
      : `Your email is confirmed. You'll get ${topicLine}, plus an occasional short update about InvesTax.`;
  const unsub = language === 'ro' ? 'Te poți dezabona oricând:' : 'You can unsubscribe at any time:';

  const bodyHtml = `
      <p style="margin:0 0 24px;line-height:1.5;">${intro}</p>
      <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">${unsub}</p>
      <p style="margin:0;font-size:13px;word-break:break-all;color:#374151;"><a href="${unsubscribeUrl}" style="color:#2563eb;">${unsubscribeUrl}</a></p>`;

  const text =
    language === 'ro'
      ? `Ești pe listă\n\nAdresa ta e confirmată. Primești ${topicLine}, plus, din când în când, noutăți scurte despre InvesTax.\n\nTe poți dezabona oricând: ${unsubscribeUrl}\n\nInvesTax · investax.app`
      : `You're on the list\n\nYour email is confirmed. You'll get ${topicLine}, plus an occasional short update about InvesTax.\n\nUnsubscribe at any time: ${unsubscribeUrl}\n\nInvesTax · investax.app`;

  await postToResend({ from: FROM_ADDRESS, to, subject, html: renderSubscribeShellHtml(language, heading, bodyHtml), text });
}

export interface BroadcastEmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
  unsubscribeUrl: string;
}

// Outbound chokepoint for list broadcasts (the backlog #9 send half, driven by
// the operator-run scripts/broadcast.ts CLI). Every broadcast carries the
// subscriber's one-click unsubscribe both in the body (rendered by the
// template) and as a List-Unsubscribe header for mail-client unsubscribe UIs.
// No reply_to: inbound on investax.app is not wired up, so replies would
// black-hole silently; templates point readers at the /contact form instead.
export async function sendBroadcastEmail(params: BroadcastEmailParams): Promise<void> {
  const { to, subject, html, text, unsubscribeUrl } = params;
  await postToResend({
    from: FROM_ADDRESS,
    to,
    subject,
    html,
    text,
    headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>` },
  });
}
