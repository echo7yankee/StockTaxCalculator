import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendPaymentConfirmationEmail,
  sendNewCustomerNotification,
  sendContactMessageNotification,
  sendParseAlertNotification,
  pickLanguage,
} from '../email.js';

const RESET_URL = 'https://investax.app/reset-password?token=abc123';
const CLIENT_URL = 'https://investax.app';

describe('pickLanguage', () => {
  it('defaults to ro when header is missing', () => {
    expect(pickLanguage(undefined)).toBe('ro');
  });
  it('returns en for English Accept-Language', () => {
    expect(pickLanguage('en-US,en;q=0.9')).toBe('en');
    expect(pickLanguage('EN')).toBe('en');
  });
  it('returns ro for Romanian or any non-en value', () => {
    expect(pickLanguage('ro-RO,ro;q=0.9')).toBe('ro');
    expect(pickLanguage('fr-FR')).toBe('ro');
  });
});

describe('sendPasswordResetEmail', () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env.RESEND_API_KEY;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test_key_123';
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.RESEND_API_KEY = originalEnv;
    process.env.NODE_ENV = originalNodeEnv;
    vi.restoreAllMocks();
  });

  it('posts a Romanian email to Resend with correct payload shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'email_abc' }), { status: 200 })
    );
    global.fetch = fetchMock;

    await sendPasswordResetEmail({
      to: 'user@example.com',
      resetUrl: RESET_URL,
      language: 'ro',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test_key_123');
    expect(init.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(init.body as string);
    expect(body.from).toBe('InvesTax <noreply@investax.app>');
    expect(body.to).toBe('user@example.com');
    expect(body.subject).toBe('Resetare parolă InvesTax');
    expect(body.html).toContain(RESET_URL);
    expect(body.html).toContain('Resetare parolă');
    expect(body.text).toContain(RESET_URL);
    expect(body.text).toContain('Resetare parolă');
  });

  it('posts an English email when language is en', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'email_def' }), { status: 200 })
    );
    global.fetch = fetchMock;

    await sendPasswordResetEmail({
      to: 'user@example.com',
      resetUrl: RESET_URL,
      language: 'en',
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.subject).toBe('Reset your InvesTax password');
    expect(body.html).toContain('Reset your password');
    expect(body.text).toContain('Reset your InvesTax password');
  });

  it('throws when Resend returns non-2xx so the caller can capture in Sentry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('rate limited', { status: 429 })
    );
    global.fetch = fetchMock;

    await expect(
      sendPasswordResetEmail({
        to: 'user@example.com',
        resetUrl: RESET_URL,
        language: 'ro',
      })
    ).rejects.toThrow(/Resend API 429/);
  });

  it('silently skips and does NOT call fetch when RESEND_API_KEY is unset', async () => {
    delete process.env.RESEND_API_KEY;
    const fetchMock = vi.fn();
    global.fetch = fetchMock;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(
      sendPasswordResetEmail({
        to: 'user@example.com',
        resetUrl: RESET_URL,
        language: 'ro',
      })
    ).resolves.toBeUndefined();

    expect(fetchMock).not.toHaveBeenCalled();
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });
});

describe('sendWelcomeEmail', () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env.RESEND_API_KEY;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test_key_123';
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.RESEND_API_KEY = originalEnv;
    process.env.NODE_ENV = originalNodeEnv;
    vi.restoreAllMocks();
  });

  it('posts a Romanian welcome email with greeting, CTAs, and support link', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'email_welcome_ro' }), { status: 200 })
    );
    global.fetch = fetchMock;

    await sendWelcomeEmail({
      to: 'newuser@example.com',
      name: 'Dragos',
      language: 'ro',
      clientUrl: CLIENT_URL,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer test_key_123');

    const body = JSON.parse(init.body as string);
    expect(body.from).toBe('InvesTax <noreply@investax.app>');
    expect(body.to).toBe('newuser@example.com');
    expect(body.subject).toBe('Bun venit la InvesTax!');
    expect(body.html).toContain('Bun venit, Dragos!');
    expect(body.html).toContain(`${CLIENT_URL}/calculator`);
    expect(body.html).toContain(`${CLIENT_URL}/pricing`);
    expect(body.html).toContain(`${CLIENT_URL}/filing-guide`);
    expect(body.html).toContain('support@investax.app');
    expect(body.text).toContain('Bun venit, Dragos!');
    expect(body.text).toContain(`${CLIENT_URL}/calculator`);
  });

  it('posts an English welcome email when language is en', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'email_welcome_en' }), { status: 200 })
    );
    global.fetch = fetchMock;

    await sendWelcomeEmail({
      to: 'newuser@example.com',
      name: 'Alex',
      language: 'en',
      clientUrl: CLIENT_URL,
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.subject).toBe('Welcome to InvesTax!');
    expect(body.html).toContain('Welcome, Alex!');
    expect(body.html).toContain(`${CLIENT_URL}/calculator`);
    expect(body.text).toContain('Welcome, Alex!');
  });

  it('falls back to a name-less greeting when name is null and escapes HTML in names', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    global.fetch = fetchMock;

    await sendWelcomeEmail({
      to: 'a@example.com',
      name: null,
      language: 'ro',
      clientUrl: CLIENT_URL,
    });
    const bodyNoName = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(bodyNoName.html).toContain('<h1');
    expect(bodyNoName.html).toContain('Bun venit!</h1>');
    expect(bodyNoName.html).not.toContain('Bun venit, !');

    fetchMock.mockClear();
    await sendWelcomeEmail({
      to: 'b@example.com',
      name: '<script>alert(1)</script>',
      language: 'en',
      clientUrl: CLIENT_URL,
    });
    const bodyXss = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(bodyXss.html).toContain('Welcome, &lt;script&gt;alert(1)&lt;/script&gt;!');
    expect(bodyXss.html).not.toContain('<script>alert(1)</script>!');
  });

  it('throws when Resend returns non-2xx so the caller can capture in Sentry', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response('boom', { status: 500 })
    );
    await expect(
      sendWelcomeEmail({
        to: 'x@example.com',
        name: null,
        language: 'ro',
        clientUrl: CLIENT_URL,
      })
    ).rejects.toThrow(/Resend API 500/);
  });

  it('silently skips and does NOT call fetch when RESEND_API_KEY is unset', async () => {
    delete process.env.RESEND_API_KEY;
    const fetchMock = vi.fn();
    global.fetch = fetchMock;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(
      sendWelcomeEmail({
        to: 'x@example.com',
        name: 'Anyone',
        language: 'ro',
        clientUrl: CLIENT_URL,
      })
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });
});

describe('sendPaymentConfirmationEmail', () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env.RESEND_API_KEY;
  const originalNodeEnv = process.env.NODE_ENV;

  const baseParams = {
    to: 'paid@example.com',
    name: 'Dragos',
    amountMinorUnits: 1200,
    currency: 'eur',
    orderId: 'cs_live_a1b2c3',
    expiresAt: new Date('2027-04-28T10:00:00.000Z'),
    clientUrl: CLIENT_URL,
  };

  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test_key_123';
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.RESEND_API_KEY = originalEnv;
    process.env.NODE_ENV = originalNodeEnv;
    vi.restoreAllMocks();
  });

  it('posts a Romanian confirmation with formatted amount, expiry, order ID, and upload CTA', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'email_pay_ro' }), { status: 200 })
    );
    global.fetch = fetchMock;

    await sendPaymentConfirmationEmail({ ...baseParams, language: 'ro' });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.subject).toBe('Mulțumim pentru achiziție!');
    expect(body.to).toBe('paid@example.com');
    expect(body.html).toContain('Mulțumim, Dragos!');
    expect(body.html).toContain('12.00 EUR');
    expect(body.html).toContain('2027-04-28');
    expect(body.html).toContain('cs_live_a1b2c3');
    expect(body.html).toContain(`${CLIENT_URL}/upload`);
    expect(body.text).toContain('Mulțumim, Dragos!');
    expect(body.text).toContain('12.00 EUR');
    expect(body.text).toContain(`${CLIENT_URL}/upload`);
  });

  it('posts an English confirmation when language is en', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'email_pay_en' }), { status: 200 })
    );
    global.fetch = fetchMock;

    await sendPaymentConfirmationEmail({ ...baseParams, language: 'en' });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.subject).toBe('Thanks for your purchase!');
    expect(body.html).toContain('Thank you, Dragos!');
    expect(body.html).toContain('12.00 EUR');
    expect(body.text).toContain('Thank you, Dragos!');
  });

  it('formats amount correctly across minor-unit values and uppercases currency', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    global.fetch = fetchMock;

    await sendPaymentConfirmationEmail({
      ...baseParams,
      amountMinorUnits: 1900,
      currency: 'usd',
      language: 'ro',
    });
    const body1 = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body1.html).toContain('19.00 USD');

    fetchMock.mockClear();
    await sendPaymentConfirmationEmail({
      ...baseParams,
      amountMinorUnits: 0,
      currency: 'eur',
      language: 'en',
    });
    const body2 = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body2.html).toContain('0.00 EUR');
  });

  it('throws when Resend returns non-2xx so the caller can capture in Sentry', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response('boom', { status: 500 })
    );
    await expect(
      sendPaymentConfirmationEmail({ ...baseParams, language: 'ro' })
    ).rejects.toThrow(/Resend API 500/);
  });

  it('silently skips and does NOT call fetch when RESEND_API_KEY is unset', async () => {
    delete process.env.RESEND_API_KEY;
    const fetchMock = vi.fn();
    global.fetch = fetchMock;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(
      sendPaymentConfirmationEmail({ ...baseParams, language: 'ro' })
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });
});

describe('sendNewCustomerNotification', () => {
  const originalFetch = global.fetch;
  const originalResend = process.env.RESEND_API_KEY;
  const originalAdmin = process.env.ADMIN_NOTIFICATION_EMAIL;
  const originalNodeEnv = process.env.NODE_ENV;

  const baseParams = {
    customerEmail: 'paul@example.com',
    customerName: 'Paul Adam',
    amountMinorUnits: 1200,
    currency: 'eur',
    stripeCustomerId: 'cus_test_abc',
    stripePaymentIntentId: 'pi_test_def',
    orderId: 'cs_live_xyz',
    planExpiresAt: new Date('2027-05-19T07:33:00.000Z'),
    isLaunchPrice: true,
  };

  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test_key_123';
    process.env.ADMIN_NOTIFICATION_EMAIL = 'admin@example.com';
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.RESEND_API_KEY = originalResend;
    if (originalAdmin === undefined) delete process.env.ADMIN_NOTIFICATION_EMAIL;
    else process.env.ADMIN_NOTIFICATION_EMAIL = originalAdmin;
    process.env.NODE_ENV = originalNodeEnv;
    vi.restoreAllMocks();
  });

  it('posts an admin notification to ADMIN_NOTIFICATION_EMAIL with customer + Stripe metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'email_admin_1' }), { status: 200 })
    );
    global.fetch = fetchMock;

    await sendNewCustomerNotification(baseParams);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');

    const body = JSON.parse(init.body as string);
    expect(body.from).toBe('InvesTax <noreply@investax.app>');
    expect(body.to).toBe('admin@example.com');
    expect(body.subject).toBe('[InvesTax] New paying customer: paul@example.com');

    // Text body contains all the operator-facing fields
    expect(body.text).toContain('paul@example.com');
    expect(body.text).toContain('Paul Adam');
    expect(body.text).toContain('12.00 EUR');
    expect(body.text).toContain('launch promo (€19)');
    expect(body.text).toContain('cus_test_abc');
    expect(body.text).toContain('pi_test_def');
    expect(body.text).toContain('cs_live_xyz');
    expect(body.text).toContain('2027-05-19');
    expect(body.text).toContain('https://dashboard.stripe.com/customers/cus_test_abc');
  });

  it('labels standard tier when isLaunchPrice is false', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    global.fetch = fetchMock;

    await sendNewCustomerNotification({ ...baseParams, isLaunchPrice: false, amountMinorUnits: 2900 });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.text).toContain('standard (€29)');
    expect(body.text).toContain('29.00 EUR');
  });

  it('handles missing customer name + missing Stripe IDs without crashing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    global.fetch = fetchMock;

    await sendNewCustomerNotification({
      ...baseParams,
      customerName: null,
      stripeCustomerId: null,
      stripePaymentIntentId: null,
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.text).toContain('(not provided)');
    expect(body.text).toContain('(missing)');
  });

  it('silently no-ops when ADMIN_NOTIFICATION_EMAIL is unset', async () => {
    delete process.env.ADMIN_NOTIFICATION_EMAIL;
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    await expect(sendNewCustomerNotification(baseParams)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws when Resend returns non-2xx so the caller can capture in Sentry', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('boom', { status: 500 }));
    await expect(sendNewCustomerNotification(baseParams)).rejects.toThrow(/Resend API 500/);
  });
});

describe('sendContactMessageNotification', () => {
  const originalFetch = global.fetch;
  const originalResend = process.env.RESEND_API_KEY;
  const originalAdmin = process.env.ADMIN_NOTIFICATION_EMAIL;
  const originalNodeEnv = process.env.NODE_ENV;

  const baseParams = {
    fromName: 'Maria Popescu',
    fromEmail: 'maria@example.com',
    topic: 'support' as const,
    message: 'Salut, am o întrebare despre dividende.',
    language: 'ro' as const,
    ipAddress: '203.0.113.42',
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
  };

  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test_key_123';
    process.env.ADMIN_NOTIFICATION_EMAIL = 'admin@example.com';
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.RESEND_API_KEY = originalResend;
    if (originalAdmin === undefined) delete process.env.ADMIN_NOTIFICATION_EMAIL;
    else process.env.ADMIN_NOTIFICATION_EMAIL = originalAdmin;
    process.env.NODE_ENV = originalNodeEnv;
    vi.restoreAllMocks();
  });

  it('posts a contact-form notification with reply_to set to the submitter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    global.fetch = fetchMock;

    await sendContactMessageNotification(baseParams);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.to).toBe('admin@example.com');
    expect(body.reply_to).toBe('maria@example.com');
    expect(body.subject).toBe('[InvesTax] Support message from Maria Popescu <maria@example.com>');
    expect(body.text).toContain('Maria Popescu');
    expect(body.text).toContain('maria@example.com');
    expect(body.text).toContain('203.0.113.42');
    expect(body.text).toContain('Salut, am o întrebare despre dividende.');
    expect(body.text).toContain('Reply directly to maria@example.com');
  });

  it('uses correct topic label for general and business inquiries', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    global.fetch = fetchMock;

    await sendContactMessageNotification({ ...baseParams, topic: 'general' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).subject)
      .toContain('General inquiry');

    fetchMock.mockClear();
    await sendContactMessageNotification({ ...baseParams, topic: 'business' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).subject)
      .toContain('Business message');
  });

  it('escapes HTML in submitted message and name', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    global.fetch = fetchMock;

    await sendContactMessageNotification({
      ...baseParams,
      fromName: '<script>alert(1)</script>',
      message: '<img src=x onerror=alert(2)>',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.html).toContain('&lt;script&gt;');
    expect(body.html).not.toContain('<script>alert(1)</script>');
    expect(body.html).toContain('&lt;img src=x onerror=alert(2)&gt;');
  });

  it('handles null IP and UA gracefully', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    global.fetch = fetchMock;

    await sendContactMessageNotification({ ...baseParams, ipAddress: null, userAgent: null });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.text).toContain('IP:       (unknown)');
    expect(body.text).toContain('UA:       (unknown)');
  });

  it('silently no-ops when ADMIN_NOTIFICATION_EMAIL is unset', async () => {
    delete process.env.ADMIN_NOTIFICATION_EMAIL;
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    await expect(sendContactMessageNotification(baseParams)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('sendParseAlertNotification', () => {
  const originalFetch = global.fetch;
  const originalResend = process.env.RESEND_API_KEY;
  const originalAdmin = process.env.ADMIN_NOTIFICATION_EMAIL;
  const originalNodeEnv = process.env.NODE_ENV;

  const baseParams = {
    userEmail: 'paul@example.com',
    userName: 'Paul Adam',
    fileType: 'pdf' as const,
    outcome: 'error' as const,
    fileName: 'annual-statement-2025.pdf',
    errorMessage: 'No statement period found in PDF',
    warnings: [] as string[],
    summary: { sells: 144, dividends: 49, distributions: 0, pages: 14, year: 2025 },
  };

  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test_key_123';
    process.env.ADMIN_NOTIFICATION_EMAIL = 'admin@example.com';
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.RESEND_API_KEY = originalResend;
    if (originalAdmin === undefined) delete process.env.ADMIN_NOTIFICATION_EMAIL;
    else process.env.ADMIN_NOTIFICATION_EMAIL = originalAdmin;
    process.env.NODE_ENV = originalNodeEnv;
    vi.restoreAllMocks();
  });

  it('posts a parse alert to ADMIN_NOTIFICATION_EMAIL with reply_to set to the customer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    global.fetch = fetchMock;

    await sendParseAlertNotification(baseParams);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.to).toBe('admin@example.com');
    expect(body.reply_to).toBe('paul@example.com');
    expect(body.subject).toBe('[InvesTax] PDF parse FAILED for paul@example.com');
    expect(body.text).toContain('Paul Adam <paul@example.com>');
    expect(body.text).toContain('annual-statement-2025.pdf');
    expect(body.text).toContain('No statement period found in PDF');
  });

  it('renders a distinct subject for each outcome', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    global.fetch = fetchMock;

    await sendParseAlertNotification({ ...baseParams, outcome: 'success' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).subject)
      .toBe('[InvesTax] PDF parsed OK for paul@example.com');

    fetchMock.mockClear();
    await sendParseAlertNotification({ ...baseParams, outcome: 'warning', fileType: 'csv' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).subject)
      .toBe('[InvesTax] CSV parse warning for paul@example.com');
  });

  it('lists warnings and parsed counts in the body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    global.fetch = fetchMock;

    await sendParseAlertNotification({
      ...baseParams,
      outcome: 'warning',
      errorMessage: null,
      warnings: ['PDF may have mixed transaction currencies', 'Row count cross-check mismatch'],
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.text).toContain('Warnings (2):');
    expect(body.text).toContain('PDF may have mixed transaction currencies');
    expect(body.text).toContain('sells');
    expect(body.text).toContain('144');
    expect(body.text).toContain('Tax year: 2025');
  });

  it('escapes HTML in warning text and filename', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    global.fetch = fetchMock;

    await sendParseAlertNotification({
      ...baseParams,
      fileName: '<script>alert(1)</script>.pdf',
      warnings: ['<img src=x onerror=alert(2)>'],
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.html).toContain('&lt;script&gt;');
    expect(body.html).not.toContain('<script>alert(1)</script>');
  });

  it('silently no-ops when ADMIN_NOTIFICATION_EMAIL is unset', async () => {
    delete process.env.ADMIN_NOTIFICATION_EMAIL;
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    await expect(sendParseAlertNotification(baseParams)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws when Resend returns non-2xx so the caller can capture in Sentry', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('boom', { status: 500 }));
    await expect(sendParseAlertNotification(baseParams)).rejects.toThrow(/Resend API 500/);
  });
});
