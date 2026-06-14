// First-party error monitoring (replaces the inert third-party Sentry wiring).
//
// Captured errors are grouped into "issues" in the ErrorEvent table, keyed by a
// fingerprint = hash(error name + normalized message + top stack frame). Repeat
// occurrences increment a counter and bump lastSeen instead of inserting a fresh
// row per hit, so the table stays a readable list of distinct problems (and its
// growth is bounded by the number of distinct fingerprints, not total volume).
//
// Everything is PII-scrubbed before storage: the message is normalized (ids,
// numbers and urls masked) and the stored sample stack has emails + query
// strings stripped, then both are truncated. This mirrors the /api/track
// sanitizers and is a privacy win over shipping raw crash payloads to a cloud.
//
// v1 records SERVER errors (the Express error handler + the uncaughtException /
// unhandledRejection process handlers). The client beacon (source='client') is
// a follow-up. Read the issues via the errors-report CLI (npm run errors).
import { createHash } from 'node:crypto';
import prisma from './prisma.js';

export interface CapturedError {
  /** Error constructor name, e.g. 'TypeError'. Defaults to 'Error'. */
  name?: string;
  /** Raw message; normalized + scrubbed before it is stored. */
  message?: string;
  /** Raw stack; its top frame feeds the fingerprint and a scrubbed copy is stored. */
  stack?: string;
  /** Origin of the error. v1 stores server errors; 'client' lands in a follow-up. */
  source?: 'server' | 'client';
  /** Optional already-sanitized context, e.g. 'GET /api/uploads'. */
  context?: string;
}

// Browser / extension / transient-network noise we never want to record. Mostly
// relevant once the client beacon lands; harmless now (a real server error never
// matches these). Matched against the RAW message, before normalization.
const JUNK_PATTERNS: readonly RegExp[] = [
  /ResizeObserver loop/i,
  /Non-Error promise rejection captured/i,
  /Failed to fetch/i,
  /NetworkError when attempting to fetch/i,
  /Load failed/i,
  /The operation was aborted/i,
  /chrome-extension:\/\//i,
  /moz-extension:\/\//i,
  /safari-extension:\/\//i,
];

export function isJunkError(message: string): boolean {
  return JUNK_PATTERNS.some((re) => re.test(message));
}

// Normalize a message so the same error carrying different ids/numbers groups
// under one fingerprint, and so we never store raw emails/ids/urls/values. Order
// matters: mask emails + urls + uuids + hex before the generic digit pass,
// otherwise the digit pass would chew the digits inside them first.
export function normalizeMessage(message: string): string {
  return message
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
    .replace(/https?:\/\/[^\s"')]+/gi, '<url>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
    .replace(/\b[0-9a-f]{16,}\b/gi, '<hex>')
    .replace(/\d+/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

// The first "at ..." frame of the stack, included in the fingerprint so the same
// crash site groups regardless of message-id noise. Scrubbed + length-capped.
export function topFrame(stack?: string): string {
  if (!stack) return '';
  for (const raw of stack.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('at ')) return scrubText(line).slice(0, 300);
  }
  return '';
}

// Scrub a full stack before storing: mask secret-shaped tokens, truncate.
export function scrubStack(stack?: string): string | undefined {
  if (!stack) return undefined;
  return scrubText(stack).slice(0, 4000);
}

// Scrub a stack frame / stack body of secret-shaped tokens while DELIBERATELY
// preserving short :line:col numbers (they are the point of a stack and feed
// topFrame's fingerprint, so grouping stays stable). Unlike normalizeMessage we
// do NOT blanket-mask every \d+ -> <n>; we only mask runs of 9+ digits (CNP 13 /
// IBAN clusters / 16-digit cards) so that :1:48213-style line:col survive.
//
// Order matters, same as normalizeMessage: mask emails + urls + uuids + Stripe
// keys + hex BEFORE the >=9-digit pass, otherwise the digit pass would chew the
// digits inside them first. The leading ? strip drops a URL query string while
// stopping at the first colon ([^\s:)]) so a trailing :line:col is kept intact.
function scrubText(s: string): string {
  return s
    .replace(/\?[^\s:)]*/g, '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
    .replace(/https?:\/\/[^\s"')]+/gi, '<url>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
    .replace(/\b[sprk]k_(live|test)_[A-Za-z0-9]+\b/g, '<key>')
    .replace(/\b[0-9a-f]{16,}\b/gi, '<hex>')
    .replace(/\d{9,}/g, '<n>');
}

export function fingerprintOf(name: string, normalizedMessage: string, frame: string): string {
  return createHash('sha256')
    .update(`${name}\n${normalizedMessage}\n${frame}`)
    .digest('hex')
    .slice(0, 16);
}

// Record one captured error into the grouped ErrorEvent table. NEVER throws: it
// runs inside the Express error handler and the process crash handlers, where a
// throw would mask the very error we are trying to report. A write failure is
// logged and swallowed.
export async function recordError(input: CapturedError): Promise<void> {
  try {
    const rawMessage = input.message ?? '';
    if (isJunkError(rawMessage)) return;

    const name = (input.name || 'Error').slice(0, 200);
    const message = normalizeMessage(rawMessage);
    const frame = topFrame(input.stack);
    const fingerprint = fingerprintOf(name, message, frame);
    const source = input.source === 'client' ? 'client' : 'server';
    const sampleStack = scrubStack(input.stack);
    const context = input.context ? input.context.slice(0, 200) : undefined;

    await prisma.errorEvent.upsert({
      where: { fingerprint },
      create: { fingerprint, source, name, message, sampleStack, context, count: 1 },
      update: { count: { increment: 1 }, lastSeen: new Date() },
    });
  } catch (err) {
    console.error('[errorMonitor] failed to record error:', err);
  }
}
