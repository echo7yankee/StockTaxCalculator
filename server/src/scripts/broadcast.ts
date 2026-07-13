// Operator-run broadcast CLI: the send half of backlog #9 (email reminders /
// occasional list updates). Deliberately NOT an HTTP endpoint: running it
// requires shell access to the box, so there is no auth surface, no rate-limit
// question, and no way for a request to trigger a mass email.
//
//   npm run broadcast -w server -- --topic filing_reminder --template product-update-2026-06
//   npm run broadcast -w server -- --topic filing_reminder --template product-update-2026-06 --to me@example.com
//   npm run broadcast -w server -- --topic filing_reminder --template product-update-2026-06 --send
//
// Default mode is a DRY RUN: prints the would-be recipients (masked) and
// subjects, sends nothing. --to sends one real test email to the given
// address only. --send emails the confirmed, not-unsubscribed subscribers of
// the topic. Recipients are throttled and a single failed send never aborts
// the rest. Requires a built dist (npm run build -w server).
import { pathToFileURL } from 'node:url';
import { SUBSCRIBE_TOPICS, type SubscribeTopic } from '../lib/subscribeTopics.js';
import { getBroadcastTemplate, BROADCAST_TEMPLATES } from '../services/broadcastTemplates.js';
import type { BroadcastEmailParams } from '../services/email.js';

export interface BroadcastRecipient {
  email: string;
  language: string;
  unsubToken: string;
}

export interface BroadcastDeps {
  prisma: {
    findManyRecipients: (topic: SubscribeTopic) => Promise<BroadcastRecipient[]>;
    findRecipient: (email: string, topic: SubscribeTopic) => Promise<BroadcastRecipient | null>;
  };
  sendEmail: (params: BroadcastEmailParams) => Promise<void>;
  log: (line: string) => void;
  /** Pause between consecutive sends; Resend's API is rate-limited. */
  delayMs: number;
  sleep: (ms: number) => Promise<void>;
}

export interface BroadcastOptions {
  topic: SubscribeTopic;
  templateName: string;
  mode: 'dry-run' | 'test' | 'send';
  testAddress?: string;
  testLanguage: 'ro' | 'en';
}

export interface BroadcastResult {
  selected: number;
  sent: number;
  failed: number;
}

export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  return `${email[0]}***${email.slice(at)}`;
}

export function parseBroadcastArgs(argv: string[]): BroadcastOptions {
  let topic: string | undefined;
  let templateName: string | undefined;
  let send = false;
  let testAddress: string | undefined;
  let testLanguage: 'ro' | 'en' = 'ro';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--topic':
        topic = argv[++i];
        break;
      case '--template':
        templateName = argv[++i];
        break;
      case '--send':
        send = true;
        break;
      case '--to':
        testAddress = argv[++i];
        break;
      case '--lang': {
        const lang = argv[++i];
        if (lang !== 'ro' && lang !== 'en') {
          throw new Error(`--lang must be "ro" or "en", got "${lang ?? ''}"`);
        }
        testLanguage = lang;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!topic) throw new Error('--topic is required');
  if (!(SUBSCRIBE_TOPICS as readonly string[]).includes(topic)) {
    throw new Error(`Unknown topic "${topic}". Valid topics: ${SUBSCRIBE_TOPICS.join(', ')}`);
  }
  if (!templateName) throw new Error('--template is required');
  if (send && testAddress) {
    throw new Error('--send and --to are mutually exclusive: --to sends a single test email, --send emails the list');
  }
  if (testAddress && !testAddress.includes('@')) {
    throw new Error(`--to expects an email address, got "${testAddress}"`);
  }

  return {
    topic: topic as SubscribeTopic,
    templateName,
    mode: testAddress ? 'test' : send ? 'send' : 'dry-run',
    testAddress,
    testLanguage,
  };
}

function unsubscribeUrlFor(token: string): string {
  const base = process.env.CLIENT_URL || 'http://localhost:5173';
  return `${base}/api/subscribe/unsubscribe?token=${token}`;
}

export async function runBroadcast(opts: BroadcastOptions, deps: BroadcastDeps): Promise<BroadcastResult> {
  const template = getBroadcastTemplate(opts.templateName);
  if (!template) {
    const available = BROADCAST_TEMPLATES.map((t) => t.name).join(', ') || '(none)';
    throw new Error(`Unknown template "${opts.templateName}". Available templates: ${available}`);
  }
  if (!template.topics.includes(opts.topic)) {
    throw new Error(
      `Template "${template.name}" is not written for topic "${opts.topic}" (its topics: ${template.topics.join(', ')}). ` +
        'Broadcast content must match what the topic subscribers consented to; add the topic to the template in a reviewed PR if it genuinely fits.'
    );
  }

  if (opts.mode === 'test') {
    const address = opts.testAddress as string;
    // Use the address's real unsubscribe token when it is subscribed to the
    // topic, so the test email is byte-identical to the real one; otherwise a
    // placeholder token renders the "invalid link" landing page if clicked.
    const existing = await deps.prisma.findRecipient(address.toLowerCase(), opts.topic);
    const unsubscribeUrl = unsubscribeUrlFor(existing?.unsubToken ?? 'test-send-preview');
    const rendered = template.render(opts.testLanguage, unsubscribeUrl);
    deps.log(`Test send: "${template.subject[opts.testLanguage]}" -> ${opts.testAddress} [${opts.testLanguage}]`);
    try {
      await deps.sendEmail({
        to: address,
        subject: template.subject[opts.testLanguage],
        html: rendered.html,
        text: rendered.text,
        unsubscribeUrl,
      });
      deps.log('Test send delivered to the email provider.');
      return { selected: 1, sent: 1, failed: 0 };
    } catch (err) {
      deps.log(`Test send FAILED: ${err instanceof Error ? err.message : String(err)}`);
      return { selected: 1, sent: 0, failed: 1 };
    }
  }

  const recipients = await deps.prisma.findManyRecipients(opts.topic);
  deps.log(
    `Topic "${opts.topic}": ${recipients.length} confirmed, not-unsubscribed recipient(s). Template "${template.name}".`
  );

  if (opts.mode === 'dry-run') {
    for (const r of recipients) {
      const lang = r.language === 'en' ? 'en' : 'ro';
      deps.log(`  would send [${lang}] "${template.subject[lang]}" -> ${maskEmail(r.email)}`);
    }
    deps.log('Dry run: nothing was sent. Re-run with --send to email the list, or --to <address> for a test email.');
    return { selected: recipients.length, sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i];
    const lang = r.language === 'en' ? 'en' : 'ro';
    const unsubscribeUrl = unsubscribeUrlFor(r.unsubToken);
    const rendered = template.render(lang, unsubscribeUrl);
    try {
      await deps.sendEmail({
        to: r.email,
        subject: template.subject[lang],
        html: rendered.html,
        text: rendered.text,
        unsubscribeUrl,
      });
      sent++;
      deps.log(`  sent [${lang}] -> ${maskEmail(r.email)} (${sent + failed}/${recipients.length})`);
    } catch (err) {
      failed++;
      deps.log(
        `  FAILED -> ${maskEmail(r.email)}: ${err instanceof Error ? err.message : String(err)} (${sent + failed}/${recipients.length})`
      );
    }
    if (i < recipients.length - 1) {
      await deps.sleep(deps.delayMs);
    }
  }

  deps.log(`Done. Sent ${sent}, failed ${failed}, selected ${recipients.length}.`);
  return { selected: recipients.length, sent, failed };
}

const USAGE = `Usage:
  npm run broadcast -w server -- --topic <topic> --template <name> [--send | --to <email> [--lang ro|en]]

Modes:
  (default)    dry run: list masked recipients and subjects, send nothing
  --to <email> send ONE real test email to the given address (--lang picks the language, default ro)
  --send       send to every confirmed, not-unsubscribed subscriber of the topic

Topics:    ${SUBSCRIBE_TOPICS.join(', ')}
Templates: ${BROADCAST_TEMPLATES.map((t) => t.name).join(', ')}`;

// Load .env deterministically relative to THIS file, not the cwd. The npm
// workspace runner launches `-w server` scripts with cwd = server/, but pm2 and
// an operator running the broadcast from the repo root resolve a different cwd;
// a bare `dotenv/config` off the cwd made the two diverge. On the box that meant
// a missing RESEND_API_KEY (postToResend then reports "sent" while sending
// nothing) and a missing CLIENT_URL (localhost unsubscribe links in a real mass
// send). Load the repo-root .env first (canonical on the box) then the
// server-local .env as a dev fallback; dotenv never overrides an already-set
// key, so root wins. Mirrors analytics-digest.ts.
async function loadEnv(): Promise<void> {
  const dotenv = await import('dotenv');
  const { fileURLToPath } = await import('node:url');
  const { dirname, resolve } = await import('node:path');
  const here = dirname(fileURLToPath(import.meta.url)); // server/dist/scripts
  dotenv.config({ path: resolve(here, '../../../.env') }); // repo-root .env
  dotenv.config({ path: resolve(here, '../../.env') }); // server/.env (dev fallback)
}

async function main(): Promise<void> {
  await loadEnv();

  let opts: BroadcastOptions;
  try {
    opts = parseBroadcastArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`[broadcast] ${err instanceof Error ? err.message : String(err)}\n`);
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const { default: prisma } = await import('../lib/prisma.js');
  const { sendBroadcastEmail } = await import('../services/email.js');

  const deps: BroadcastDeps = {
    prisma: {
      findManyRecipients: (topic) =>
        prisma.emailSubscriber.findMany({
          where: { topic, confirmedAt: { not: null }, unsubscribedAt: null },
          orderBy: { createdAt: 'asc' },
          select: { email: true, language: true, unsubToken: true },
        }),
      findRecipient: (email, topic) =>
        prisma.emailSubscriber.findUnique({
          where: { email_topic: { email, topic } },
          select: { email: true, language: true, unsubToken: true },
        }),
    },
    sendEmail: sendBroadcastEmail,
    log: console.log,
    delayMs: 600,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };

  try {
    const result = await runBroadcast(opts, deps);
    if (result.failed > 0) process.exitCode = 1;
  } catch (err) {
    console.error(`[broadcast] ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

// Run only when executed directly (node dist/scripts/broadcast.js), never on
// import: tests import the pure functions above without touching the DB.
const isDirectRun = (() => {
  try {
    return process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  await main();
}
