import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import { Server } from 'http';

// Mock the email service module before importing the router so the route picks up
// the mocked binding. Avoids global.fetch mocking, which would also intercept the
// test's own HTTP calls to the local express server.
const sendContactMessageNotificationMock = vi.fn();
vi.mock('../../services/email.js', () => ({
  sendContactMessageNotification: sendContactMessageNotificationMock,
}));

const { contactRouter } = await import('../contact.js');

let server: Server;
const PORT = 3098;
const BASE = `http://localhost:${PORT}`;

beforeAll(() => {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/contact', contactRouter);
  server = app.listen(PORT);
});

afterAll(() => {
  server?.close();
});

const validBody = {
  name: 'Maria Popescu',
  email: 'maria@example.com',
  topic: 'support' as const,
  message: 'Salut, am o întrebare despre extrasul de pe Trading 212.',
  language: 'ro' as const,
};

const originalNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  sendContactMessageNotificationMock.mockReset();
  sendContactMessageNotificationMock.mockResolvedValue(undefined);
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe('POST /api/contact', () => {
  it('returns 200 and fires the admin notification with submitter metadata', async () => {
    const res = await fetch(`${BASE}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'TestAgent/1.0' },
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    expect(sendContactMessageNotificationMock).toHaveBeenCalledTimes(1);
    const callArgs = sendContactMessageNotificationMock.mock.calls[0][0];
    expect(callArgs.fromName).toBe('Maria Popescu');
    expect(callArgs.fromEmail).toBe('maria@example.com');
    expect(callArgs.topic).toBe('support');
    expect(callArgs.message).toBe('Salut, am o întrebare despre extrasul de pe Trading 212.');
    expect(callArgs.language).toBe('ro');
    expect(callArgs.userAgent).toBe('TestAgent/1.0');
  });

  it('returns 400 when name is missing', async () => {
    const res = await fetch(`${BASE}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, name: '' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid input');
    expect(body.field).toBe('name');
  });

  it('returns 400 when email is malformed', async () => {
    const res = await fetch(`${BASE}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, email: 'not-an-email' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe('email');
  });

  it('returns 400 when topic is not in the allowed enum', async () => {
    const res = await fetch(`${BASE}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, topic: 'spam' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe('topic');
  });

  it('returns 400 when message is shorter than 10 chars', async () => {
    const res = await fetch(`${BASE}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, message: 'too short' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe('message');
  });

  it('returns 400 when message exceeds 5000 chars', async () => {
    const res = await fetch(`${BASE}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, message: 'A'.repeat(5001) }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe('message');
  });

  it('returns 200 when the email function silently no-ops (ADMIN_NOTIFICATION_EMAIL unset)', async () => {
    // sendContactMessageNotification resolves with undefined when the env var is unset
    // (the function itself decides; from the route's POV success looks identical).
    sendContactMessageNotificationMock.mockResolvedValueOnce(undefined);

    const res = await fetch(`${BASE}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(200);
    expect(sendContactMessageNotificationMock).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when sendContactMessageNotification throws', async () => {
    sendContactMessageNotificationMock.mockRejectedValueOnce(new Error('Resend API 500: boom'));

    const res = await fetch(`${BASE}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/Failed to send message/);
  });

  it('accepts general and business topic values', async () => {
    for (const topic of ['general', 'business'] as const) {
      const res = await fetch(`${BASE}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validBody, topic }),
      });
      expect(res.status).toBe(200);
    }
    expect(sendContactMessageNotificationMock).toHaveBeenCalledTimes(2);
    expect(sendContactMessageNotificationMock.mock.calls[0][0].topic).toBe('general');
    expect(sendContactMessageNotificationMock.mock.calls[1][0].topic).toBe('business');
  });

  it('defaults language to ro when omitted', async () => {
    const { language: _ignored, ...withoutLanguage } = validBody;
    const res = await fetch(`${BASE}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(withoutLanguage),
    });
    expect(res.status).toBe(200);
    expect(sendContactMessageNotificationMock.mock.calls[0][0].language).toBe('ro');
  });
});
