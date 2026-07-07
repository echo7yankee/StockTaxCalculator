import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import { Server } from 'http';

// Mock prisma + the email service before importing the router so the route picks
// up the mocked bindings. The factories reference these consts lazily (called at
// the dynamic import below, after the consts are initialized).
const findUniqueMock = vi.fn();
const upsertMock = vi.fn();
const updateMock = vi.fn();
vi.mock('../../lib/prisma.js', () => ({
  default: {
    emailSubscriber: {
      findUnique: findUniqueMock,
      upsert: upsertMock,
      update: updateMock,
    },
  },
}));

const sendConfirmMock = vi.fn();
const sendWelcomeMock = vi.fn();
vi.mock('../../services/email.js', () => ({
  sendSubscribeConfirmEmail: sendConfirmMock,
  sendSubscribeWelcomeEmail: sendWelcomeMock,
}));

const { subscribeRouter } = await import('../subscribe.js');

let server: Server;
let BASE = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/subscribe', subscribeRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === 'string' || address.port === 0) {
    throw new Error('Expected a TCP address with non-zero port from app.listen(0)');
  }
  BASE = `http://localhost:${address.port}`;
});

afterAll(() => {
  server?.close();
});

const originalNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  findUniqueMock.mockReset();
  upsertMock.mockReset();
  updateMock.mockReset();
  sendConfirmMock.mockReset();
  sendWelcomeMock.mockReset();
  // Defaults: nothing found, writes + sends succeed.
  findUniqueMock.mockResolvedValue(null);
  upsertMock.mockResolvedValue({});
  updateMock.mockResolvedValue({});
  sendConfirmMock.mockResolvedValue(undefined);
  sendWelcomeMock.mockResolvedValue(undefined);
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

function post(body: unknown) {
  return fetch(`${BASE}/api/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/subscribe', () => {
  it('creates a pending row and sends a confirm email for a new address', async () => {
    const res = await post({ email: 'New@Example.com', topic: 'filing_reminder', language: 'ro' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    expect(upsertMock).toHaveBeenCalledTimes(1);
    const upsertArg = upsertMock.mock.calls[0][0];
    // Email is normalized to lowercase before storage + lookup.
    expect(upsertArg.where.email_topic).toEqual({ email: 'new@example.com', topic: 'filing_reminder' });
    expect(upsertArg.create.confirmToken).toEqual(expect.any(String));
    expect(upsertArg.create.unsubToken).toEqual(expect.any(String));

    expect(sendConfirmMock).toHaveBeenCalledTimes(1);
    const mailArg = sendConfirmMock.mock.calls[0][0];
    expect(mailArg.to).toBe('new@example.com');
    expect(mailArg.topic).toBe('filing_reminder');
    expect(mailArg.confirmUrl).toContain('/api/subscribe/confirm?token=');
  });

  it('returns the same 200 without re-sending for an already-confirmed subscriber (no enumeration leak)', async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: 'sub_1',
      email: 'taken@example.com',
      topic: 'filing_reminder',
      confirmedAt: new Date(),
      unsubscribedAt: null,
      unsubToken: 'u1',
    });

    const res = await post({ email: 'taken@example.com', topic: 'filing_reminder' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(upsertMock).not.toHaveBeenCalled();
    expect(sendConfirmMock).not.toHaveBeenCalled();
  });

  it('re-sends confirmation and reuses the unsub token for a pending subscriber', async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: 'sub_2',
      email: 'pending@example.com',
      topic: 'broker_revolut',
      confirmedAt: null,
      unsubscribedAt: null,
      unsubToken: 'reuse-me',
    });

    const res = await post({ email: 'pending@example.com', topic: 'broker_revolut' });

    expect(res.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock.mock.calls[0][0].create.unsubToken).toBe('reuse-me');
    expect(upsertMock.mock.calls[0][0].update.confirmedAt).toBeNull();
    expect(sendConfirmMock).toHaveBeenCalledTimes(1);
  });

  it('silently drops a submission that trips the honeypot', async () => {
    const res = await post({ email: 'bot@example.com', topic: 'filing_reminder', website: 'http://spam' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
    expect(sendConfirmMock).not.toHaveBeenCalled();
  });

  it('returns 400 for a malformed email', async () => {
    const res = await post({ email: 'not-an-email', topic: 'filing_reminder' });
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe('email');
  });

  it('returns 400 for a topic outside the allowed set', async () => {
    const res = await post({ email: 'a@b.co', topic: 'crypto_module' });
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe('topic');
  });

  it('accepts the prior_years waitlist topic (the 2023/2024 demand probe)', async () => {
    const res = await post({ email: 'rectificativa@example.com', topic: 'prior_years' });

    expect(res.status).toBe(200);
    expect(upsertMock.mock.calls[0][0].where.email_topic).toEqual({
      email: 'rectificativa@example.com',
      topic: 'prior_years',
    });
    expect(sendConfirmMock.mock.calls[0][0].topic).toBe('prior_years');
  });

  it.each(['unsupported_statement', 'crypto_exchange'])(
    'accepts the gate-blocked lead-capture topic %s (backlog #24B PR-4)',
    async (topic) => {
      const res = await post({
        email: 'blocked@example.com',
        topic,
        source: 'checker:unreadable:binance',
      });

      expect(res.status).toBe(200);
      expect(upsertMock.mock.calls[0][0].where.email_topic).toEqual({
        email: 'blocked@example.com',
        topic,
      });
      expect(upsertMock.mock.calls[0][0].create.source).toBe('checker:unreadable:binance');
      expect(sendConfirmMock.mock.calls[0][0].topic).toBe(topic);
    },
  );

  it('returns 400 when email is missing', async () => {
    const res = await post({ topic: 'filing_reminder' });
    expect(res.status).toBe(400);
  });

  it('defaults language to ro when omitted', async () => {
    await post({ email: 'nolang@example.com', topic: 'broker_ibkr' });
    expect(sendConfirmMock.mock.calls[0][0].language).toBe('ro');
  });

  it('returns 500 when the database write throws', async () => {
    upsertMock.mockRejectedValueOnce(new Error('db down'));
    const res = await post({ email: 'boom@example.com', topic: 'filing_reminder' });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/Failed to subscribe/);
  });
});

describe('GET /api/subscribe/confirm', () => {
  it('confirms a pending subscriber and sends the welcome email once', async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: 'sub_3',
      email: 'confirm@example.com',
      topic: 'filing_reminder',
      language: 'ro',
      confirmedAt: null,
      unsubToken: 'unsub-3',
    });

    const res = await fetch(`${BASE}/api/subscribe/confirm?token=abc123`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Abonare confirmată');

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][0].data.confirmedAt).toBeInstanceOf(Date);
    expect(sendWelcomeMock).toHaveBeenCalledTimes(1);
    expect(sendWelcomeMock.mock.calls[0][0].unsubscribeUrl).toContain('/api/subscribe/unsubscribe?token=unsub-3');
  });

  it('does not re-send the welcome email when the row was already confirmed', async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: 'sub_4',
      email: 'already@example.com',
      topic: 'filing_reminder',
      language: 'en',
      confirmedAt: new Date(),
      unsubToken: 'unsub-4',
    });

    const res = await fetch(`${BASE}/api/subscribe/confirm?token=def456`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Subscription confirmed');
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(sendWelcomeMock).not.toHaveBeenCalled();
  });

  it('does not resurrect an unsubscribed row when an old confirm link is re-clicked', async () => {
    // Stale confirm link clicked after the owner already opted out:
    // subscribe -> confirm -> unsubscribe -> re-click the original confirm email.
    findUniqueMock.mockResolvedValueOnce({
      id: 'sub_7',
      email: 'optout@example.com',
      topic: 'filing_reminder',
      language: 'ro',
      confirmedAt: new Date('2026-05-01T00:00:00Z'),
      unsubscribedAt: new Date('2026-06-01T00:00:00Z'),
      unsubToken: 'unsub-7',
    });

    const res = await fetch(`${BASE}/api/subscribe/confirm?token=stale`);
    expect(res.status).toBe(200);

    // The confirm write must never set unsubscribedAt back to null, or the stale
    // link would silently re-subscribe someone who has opted out (GDPR-adjacent).
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][0].data).not.toHaveProperty('unsubscribedAt');
    // Already-confirmed row -> no second welcome email.
    expect(sendWelcomeMock).not.toHaveBeenCalled();
  });

  it('shows an invalid-link page for an unknown token', async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    const res = await fetch(`${BASE}/api/subscribe/confirm?token=nope`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Link invalid');
    expect(updateMock).not.toHaveBeenCalled();
    expect(sendWelcomeMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the token is missing', async () => {
    const res = await fetch(`${BASE}/api/subscribe/confirm`);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/subscribe/unsubscribe', () => {
  it('marks a subscriber unsubscribed and shows the confirmation page', async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: 'sub_5',
      email: 'leaving@example.com',
      topic: 'filing_reminder',
      language: 'ro',
      unsubscribedAt: null,
    });

    const res = await fetch(`${BASE}/api/subscribe/unsubscribe?token=unsub-5`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Te-ai dezabonat');
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][0].data.unsubscribedAt).toBeInstanceOf(Date);
  });

  it('is idempotent when already unsubscribed (no second write)', async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: 'sub_6',
      email: 'gone@example.com',
      topic: 'filing_reminder',
      language: 'ro',
      unsubscribedAt: new Date(),
    });

    const res = await fetch(`${BASE}/api/subscribe/unsubscribe?token=unsub-6`);
    expect(res.status).toBe(200);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('shows an invalid-link page for an unknown unsubscribe token', async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    const res = await fetch(`${BASE}/api/subscribe/unsubscribe?token=nope`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Link invalid');
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the token is missing', async () => {
    const res = await fetch(`${BASE}/api/subscribe/unsubscribe`);
    expect(res.status).toBe(400);
  });
});
