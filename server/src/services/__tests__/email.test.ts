import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendPasswordResetEmail, pickLanguage } from '../email.js';

const RESET_URL = 'https://investax.app/reset-password?token=abc123';

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
