import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendPasswordResetEmail, sendWelcomeEmail, pickLanguage } from '../email.js';

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
