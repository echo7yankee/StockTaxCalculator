# First-party analytics runbook

InvesTax uses its own cookieless analytics instead of a third-party tool. The
client beacons pageviews + conversion-funnel events to `POST /api/track`; the
server stores them in the `AnalyticsEvent` table. Read them with the CLI below.

## What is collected (and what is not)

Stored per event: the event `name`, the `path` (pathname only, query/hash
stripped), and the referrer `host` (e.g. `chatgpt.com`), plus a timestamp.

NOT stored: no IP, no user-agent, no cookie, no visitor id, no account link, no
query strings. This is strictly less data than Plausible collected, so it is
first-party, cookieless, and keeps the "essential cookies only" claim true. The
privacy policy reflects this (no third-party analytics processor).

Event names are allowlisted in `server/src/lib/analyticsEvents.ts`; the endpoint
rejects anything else. Obvious crawler user-agents are dropped (inspected, never
stored). Funnel events require JS, so bots rarely inflate them.

## Reading the data (operator CLI, on the box)

Read-only. Deliberately NOT an HTTP endpoint (shell access only = no auth
surface). Needs a built dist (`npm run build -w server`).

```bash
npm run analytics -w server                 # last 30 days (default)
npm run analytics -w server -- --days 7     # last 7 days
npm run analytics -w server -- --since 2026-09-01
npm run analytics -w server -- --all        # no time filter
```

The report prints: total events + pageviews, top pages, top referrer hosts
(channel attribution, e.g. how many came from chatgpt.com), the four-step
conversion funnel (`paywall_seen -> pricing_viewed -> checkout_started ->
payment_completed`) with step conversion percentages, and the remaining event
counts.

## Why this exists

Replaces the paid Plausible trial (declined while clientless, session #134). The
data has to be in place before traffic arrives (autumn notificare wave, the
Feb-May 2027 season), and the conversion-funnel work lane is gated on having it.

## Retention / housekeeping

Rows are tiny and indexed by `createdAt`. There is no auto-prune yet; at current
(near-zero) volume none is needed. If the table ever grows large, prune old rows
with a one-off `prisma` delete by `createdAt` or add a scheduled job. The funnel
report only needs recent windows anyway.
