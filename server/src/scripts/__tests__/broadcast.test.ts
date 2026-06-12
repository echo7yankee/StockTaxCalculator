import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Fixture registry: deterministic templates so these tests pin the CLI's
// behavior, not the real broadcast copy (covered by broadcastTemplates.test.ts).
vi.mock('../../services/broadcastTemplates.js', () => {
  const fixtureAll = {
    name: 'fixture-all',
    description: 'fixture covering two topics',
    topics: ['filing_reminder', 'broker_ibkr'],
    subject: { ro: 'Subiect RO', en: 'Subject EN' },
    render: (language: 'ro' | 'en', unsubscribeUrl: string) => ({
      html: `<html lang="${language}">${unsubscribeUrl}</html>`,
      text: `${language} text ${unsubscribeUrl}`,
    }),
  };
  const fixtureNarrow = { ...fixtureAll, name: 'fixture-narrow', topics: ['broker_ibkr'] };
  const BROADCAST_TEMPLATES = [fixtureAll, fixtureNarrow];
  return {
    BROADCAST_TEMPLATES,
    getBroadcastTemplate: (name: string) => BROADCAST_TEMPLATES.find((t) => t.name === name),
  };
});

const { parseBroadcastArgs, runBroadcast, maskEmail } = await import('../broadcast.js');
type Recipient = { email: string; language: string; unsubToken: string };

function makeDeps(recipients: Recipient[] = []) {
  return {
    prisma: {
      findManyRecipients: vi.fn().mockResolvedValue(recipients),
      findRecipient: vi.fn().mockResolvedValue(null),
    },
    sendEmail: vi.fn().mockResolvedValue(undefined),
    log: vi.fn(),
    delayMs: 5,
    sleep: vi.fn().mockResolvedValue(undefined),
  };
}

function loggedLines(deps: ReturnType<typeof makeDeps>): string {
  return deps.log.mock.calls.map((c) => String(c[0])).join('\n');
}

describe('maskEmail', () => {
  it('keeps the first character and the domain', () => {
    expect(maskEmail('alice@example.com')).toBe('a***@example.com');
  });
  it('handles degenerate strings without throwing', () => {
    expect(maskEmail('notanemail')).toBe('***');
    expect(maskEmail('@host')).toBe('***');
  });
});

describe('parseBroadcastArgs', () => {
  it('parses a dry run', () => {
    expect(parseBroadcastArgs(['--topic', 'filing_reminder', '--template', 'fixture-all'])).toEqual({
      topic: 'filing_reminder',
      templateName: 'fixture-all',
      mode: 'dry-run',
      testAddress: undefined,
      testLanguage: 'ro',
    });
  });

  it('parses --send mode', () => {
    const opts = parseBroadcastArgs(['--topic', 'broker_ibkr', '--template', 'fixture-all', '--send']);
    expect(opts.mode).toBe('send');
  });

  it('parses --to test mode with --lang', () => {
    const opts = parseBroadcastArgs([
      '--topic', 'filing_reminder', '--template', 'fixture-all', '--to', 'Me@Example.com', '--lang', 'en',
    ]);
    expect(opts.mode).toBe('test');
    expect(opts.testAddress).toBe('Me@Example.com');
    expect(opts.testLanguage).toBe('en');
  });

  it('rejects missing or unknown topic', () => {
    expect(() => parseBroadcastArgs(['--template', 'fixture-all'])).toThrow(/--topic is required/);
    expect(() => parseBroadcastArgs(['--topic', 'nope', '--template', 'fixture-all'])).toThrow(/Unknown topic/);
  });

  it('rejects missing template, --send with --to, bad --lang, bad --to, unknown args', () => {
    expect(() => parseBroadcastArgs(['--topic', 'filing_reminder'])).toThrow(/--template is required/);
    expect(() =>
      parseBroadcastArgs(['--topic', 'filing_reminder', '--template', 'fixture-all', '--send', '--to', 'a@b.co'])
    ).toThrow(/mutually exclusive/);
    expect(() =>
      parseBroadcastArgs(['--topic', 'filing_reminder', '--template', 'fixture-all', '--lang', 'fr'])
    ).toThrow(/--lang must be/);
    expect(() =>
      parseBroadcastArgs(['--topic', 'filing_reminder', '--template', 'fixture-all', '--to', 'nope'])
    ).toThrow(/expects an email address/);
    expect(() => parseBroadcastArgs(['--frobnicate'])).toThrow(/Unknown argument/);
  });
});

describe('runBroadcast', () => {
  const originalClientUrl = process.env.CLIENT_URL;

  beforeEach(() => {
    process.env.CLIENT_URL = 'https://investax.app';
  });

  afterEach(() => {
    process.env.CLIENT_URL = originalClientUrl;
    vi.clearAllMocks();
  });

  const threeRecipients: Recipient[] = [
    { email: 'alice@example.com', language: 'ro', unsubToken: 'tokA' },
    { email: 'bob@example.com', language: 'en', unsubToken: 'tokB' },
    { email: 'carol@example.com', language: 'de', unsubToken: 'tokC' },
  ];

  it('throws on unknown template, listing the available ones', async () => {
    const deps = makeDeps();
    await expect(
      runBroadcast(
        { topic: 'filing_reminder', templateName: 'nope', mode: 'dry-run', testLanguage: 'ro' },
        deps
      )
    ).rejects.toThrow(/Unknown template "nope".*fixture-all/);
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });

  it('refuses a topic the template was not written for', async () => {
    const deps = makeDeps(threeRecipients);
    await expect(
      runBroadcast(
        { topic: 'filing_reminder', templateName: 'fixture-narrow', mode: 'send', testLanguage: 'ro' },
        deps
      )
    ).rejects.toThrow(/not written for topic "filing_reminder"/);
    expect(deps.prisma.findManyRecipients).not.toHaveBeenCalled();
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });

  it('dry run selects recipients, sends nothing, and never logs a full address', async () => {
    const deps = makeDeps(threeRecipients);
    const result = await runBroadcast(
      { topic: 'filing_reminder', templateName: 'fixture-all', mode: 'dry-run', testLanguage: 'ro' },
      deps
    );

    expect(result).toEqual({ selected: 3, sent: 0, failed: 0 });
    expect(deps.prisma.findManyRecipients).toHaveBeenCalledWith('filing_reminder');
    expect(deps.sendEmail).not.toHaveBeenCalled();
    const logs = loggedLines(deps);
    expect(logs).toContain('a***@example.com');
    expect(logs).not.toContain('alice@example.com');
    expect(logs).toContain('Dry run: nothing was sent');
  });

  it('send mode emails each recipient in their language with their own unsubscribe token', async () => {
    const deps = makeDeps(threeRecipients);
    const result = await runBroadcast(
      { topic: 'filing_reminder', templateName: 'fixture-all', mode: 'send', testLanguage: 'ro' },
      deps
    );

    expect(result).toEqual({ selected: 3, sent: 3, failed: 0 });
    expect(deps.sendEmail).toHaveBeenCalledTimes(3);

    const calls = deps.sendEmail.mock.calls.map((c) => c[0]);
    expect(calls[0].to).toBe('alice@example.com');
    expect(calls[0].subject).toBe('Subiect RO');
    expect(calls[0].unsubscribeUrl).toBe('https://investax.app/api/subscribe/unsubscribe?token=tokA');
    expect(calls[0].html).toContain('token=tokA');
    expect(calls[0].text).toContain('token=tokA');

    expect(calls[1].to).toBe('bob@example.com');
    expect(calls[1].subject).toBe('Subject EN');
    expect(calls[1].unsubscribeUrl).toContain('token=tokB');

    // Unknown stored language falls back to Romanian.
    expect(calls[2].subject).toBe('Subiect RO');

    // Throttle: a pause between consecutive sends, none after the last.
    expect(deps.sleep).toHaveBeenCalledTimes(2);
    expect(deps.sleep).toHaveBeenCalledWith(5);
  });

  it('continues past a failed recipient and reports counts', async () => {
    const deps = makeDeps(threeRecipients);
    deps.sendEmail
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Resend API 429: slow down'))
      .mockResolvedValueOnce(undefined);

    const result = await runBroadcast(
      { topic: 'filing_reminder', templateName: 'fixture-all', mode: 'send', testLanguage: 'ro' },
      deps
    );

    expect(result).toEqual({ selected: 3, sent: 2, failed: 1 });
    expect(deps.sendEmail).toHaveBeenCalledTimes(3);
    expect(loggedLines(deps)).toContain('FAILED -> b***@example.com');
  });

  it('test mode sends one email to the given address with the placeholder token when unsubscribed', async () => {
    const deps = makeDeps();
    const result = await runBroadcast(
      {
        topic: 'filing_reminder',
        templateName: 'fixture-all',
        mode: 'test',
        testAddress: 'Dragos@Example.com',
        testLanguage: 'en',
      },
      deps
    );

    expect(result).toEqual({ selected: 1, sent: 1, failed: 0 });
    expect(deps.prisma.findRecipient).toHaveBeenCalledWith('dragos@example.com', 'filing_reminder');
    expect(deps.prisma.findManyRecipients).not.toHaveBeenCalled();
    const call = deps.sendEmail.mock.calls[0][0];
    expect(call.to).toBe('Dragos@Example.com');
    expect(call.subject).toBe('Subject EN');
    expect(call.unsubscribeUrl).toContain('token=test-send-preview');
  });

  it('test mode uses the real unsubscribe token when the address is subscribed', async () => {
    const deps = makeDeps();
    deps.prisma.findRecipient.mockResolvedValue({
      email: 'dragos@example.com',
      language: 'ro',
      unsubToken: 'realtok',
    });

    await runBroadcast(
      {
        topic: 'filing_reminder',
        templateName: 'fixture-all',
        mode: 'test',
        testAddress: 'dragos@example.com',
        testLanguage: 'ro',
      },
      deps
    );

    expect(deps.sendEmail.mock.calls[0][0].unsubscribeUrl).toContain('token=realtok');
  });

  it('test mode reports a failed send instead of throwing', async () => {
    const deps = makeDeps();
    deps.sendEmail.mockRejectedValue(new Error('Resend API 500'));

    const result = await runBroadcast(
      {
        topic: 'filing_reminder',
        templateName: 'fixture-all',
        mode: 'test',
        testAddress: 'dragos@example.com',
        testLanguage: 'ro',
      },
      deps
    );

    expect(result).toEqual({ selected: 1, sent: 0, failed: 1 });
    expect(loggedLines(deps)).toContain('Test send FAILED');
  });
});
