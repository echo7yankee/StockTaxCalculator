import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BROADCAST_TEMPLATES, getBroadcastTemplate } from '../broadcastTemplates.js';
import { sendBroadcastEmail } from '../email.js';
import { SUBSCRIBE_TOPICS } from '../../lib/subscribeTopics.js';

const UNSUB_URL = 'https://investax.app/api/subscribe/unsubscribe?token=tok123';
const LANGUAGES = ['ro', 'en'] as const;
// Em dash (U+2014), en dash (U+2013), horizontal bar (U+2015): banned in all
// outbound copy (house style). Built from char codes so this source file
// contains none of the banned characters itself.
const BANNED_DASHES = new RegExp('[' + String.fromCharCode(0x2013, 0x2014, 0x2015) + ']');

describe('broadcast template registry', () => {
  it('has at least one template and unique kebab-case names', () => {
    expect(BROADCAST_TEMPLATES.length).toBeGreaterThan(0);
    const names = BROADCAST_TEMPLATES.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('getBroadcastTemplate finds by name and returns undefined for unknown', () => {
    expect(getBroadcastTemplate(BROADCAST_TEMPLATES[0].name)).toBe(BROADCAST_TEMPLATES[0]);
    expect(getBroadcastTemplate('nope-not-a-template')).toBeUndefined();
  });

  it.each(BROADCAST_TEMPLATES.map((t) => [t.name, t] as const))(
    '%s declares only valid topics and at least one',
    (_name, template) => {
      expect(template.topics.length).toBeGreaterThan(0);
      for (const topic of template.topics) {
        expect(SUBSCRIBE_TOPICS).toContain(topic);
      }
    }
  );

  for (const lang of LANGUAGES) {
    it.each(BROADCAST_TEMPLATES.map((t) => [t.name, t] as const))(
      `%s renders ${lang} with subject, unsubscribe link in html AND text, and no banned dashes`,
      (_name, template) => {
        expect(template.subject[lang].trim().length).toBeGreaterThan(0);

        const rendered = template.render(lang, UNSUB_URL);
        expect(rendered.html).toContain('<!DOCTYPE html>');
        expect(rendered.html).toContain(`lang="${lang}"`);
        // The unsubscribe link is the consent escape hatch: it must survive in
        // both the html and the plain-text part of every broadcast.
        expect(rendered.html).toContain(UNSUB_URL);
        expect(rendered.text).toContain(UNSUB_URL);
        // Plain-text part must actually be plain text.
        expect(rendered.text).not.toMatch(/<[a-z][\s\S]*>/i);
        expect(template.subject[lang]).not.toMatch(BANNED_DASHES);
        expect(rendered.html).not.toMatch(BANNED_DASHES);
        expect(rendered.text).not.toMatch(BANNED_DASHES);
      }
    );
  }
});

describe('product-update-2026-06 content', () => {
  const template = getBroadcastTemplate('product-update-2026-06')!;

  it('is registered for all four capture topics', () => {
    expect([...template.topics].sort()).toEqual(
      ['broker_ibkr', 'broker_revolut', 'filing_reminder', 'prior_years'].sort()
    );
  });

  it.each(LANGUAGES)('links the three referenced pages and the contact form (%s)', (lang) => {
    const rendered = template.render(lang, UNSUB_URL);
    for (const part of [rendered.html, rendered.text]) {
      expect(part).toContain('https://investax.app/ghid/notificare-anaf-venituri-strainatate/');
      expect(part).toContain('https://investax.app/ghid/declaratie-unica-ibkr/');
      expect(part).toContain('https://investax.app/ghid/declaratie-unica-revolut/');
      expect(part).toContain('https://investax.app/contact');
    }
  });

  it.each(LANGUAGES)(
    'frames 2023/2024 as live, not a waitlist, and links the free checker (%s)',
    (lang) => {
      // PR #221 flipped 2023/2024 engineSupported on, so these years compute
      // now. The template must not invite users onto a waitlist for a
      // capability that already shipped.
      const rendered = template.render(lang, UNSUB_URL);
      for (const part of [rendered.html, rendered.text]) {
        expect(part).toContain('https://investax.app/verifica-extras');
        expect(part).not.toMatch(/list[ăa] de a[șs]teptare|waitlist/i);
        expect(part).not.toMatch(/Pregătim anii|Groundwork for tax years/i);
      }
    }
  );

  it.each(LANGUAGES)('states no tax rate, bracket, or deadline claims (%s)', (lang) => {
    const rendered = template.render(lang, UNSUB_URL);
    // The template deliberately links to the guides instead of stating tax
    // facts, keeping it outside the backlog #22 verification gate. Percentages
    // or lei amounts appearing here mean someone added a claim: route it
    // through the tax-fact gate and update this expectation consciously.
    expect(rendered.text).not.toMatch(/%/);
    expect(rendered.text).not.toMatch(/\blei\b/i);
    expect(rendered.text).not.toMatch(/\bRON\b/);
  });
});

describe('sendBroadcastEmail', () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.RESEND_API_KEY;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test_key_123';
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.RESEND_API_KEY = originalKey;
    process.env.NODE_ENV = originalNodeEnv;
    vi.restoreAllMocks();
  });

  it('posts to Resend with the List-Unsubscribe header and no reply_to', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'email_xyz' }), { status: 200 })
    );
    global.fetch = fetchMock;

    await sendBroadcastEmail({
      to: 'subscriber@example.com',
      subject: 'Hello',
      html: `<p>Hi</p><a href="${UNSUB_URL}">unsub</a>`,
      text: `Hi ${UNSUB_URL}`,
      unsubscribeUrl: UNSUB_URL,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    const body = JSON.parse(init.body as string);
    expect(body.from).toBe('InvesTax <noreply@investax.app>');
    expect(body.to).toBe('subscriber@example.com');
    expect(body.subject).toBe('Hello');
    expect(body.headers).toEqual({ 'List-Unsubscribe': `<${UNSUB_URL}>` });
    // Inbound mail on the domain is not wired up: replies must not be invited.
    expect(body.reply_to).toBeUndefined();
  });

  it('propagates a Resend failure so the CLI can count it', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 }));

    await expect(
      sendBroadcastEmail({
        to: 'subscriber@example.com',
        subject: 'Hello',
        html: '<p>Hi</p>',
        text: 'Hi',
        unsubscribeUrl: UNSUB_URL,
      })
    ).rejects.toThrow(/Resend API 429/);
  });
});
