import * as Sentry from '@sentry/node';

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
    Sentry.captureException(err, {
      tags: { service: 'email', status: String(response.status) },
    });
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
