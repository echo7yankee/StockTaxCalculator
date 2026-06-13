# List broadcast runbook (backlog #9, send half)

How to email the `EmailSubscriber` lists (filing reminders, broker beta waitlists, prior-year waitlist). The mechanism is an operator-run CLI on the server, deliberately not an HTTP endpoint: sending requires shell access, so there is no auth surface and no way for a request to trigger a mass email.

## Hard rules

1. **Per-topic only.** A broadcast goes to ONE topic per run, and the template must declare that topic in its `topics` list (the CLI refuses otherwise). The topic is the consent boundary: subscribers opted into that subject, occasional short product updates included (welcome-email wording since 2026-06), not into anything-goes marketing.
2. **Templates are committed code** (`server/src/services/broadcastTemplates.ts`). A new broadcast = a new template in a reviewed PR. Any Romanian tax claim (rate, bracket, deadline) in a template must clear the backlog #22 tax-fact verification gate first; prefer linking the ghid pages instead of restating facts.
3. **No em dashes, RO diacritics, peer voice** (house style). The registry test enforces the dash ban and the unsubscribe link in both HTML and text parts.
4. **Always dry-run, then test-send to yourself, then send.** Never skip straight to `--send`.
5. **Frequency:** "from time to time" means roughly monthly at most outside the season. The fastest way to burn the list is sending when there is nothing to say.

## Commands (run on the VPS in `~/app`, after a deploy so `dist/` is fresh)

```bash
# 1. Dry run: who would receive it, nothing sent
npm run broadcast -w server -- --topic filing_reminder --template product-update-2026-06

# 2. One real test email to yourself (RO; use --lang en for the English render)
npm run broadcast -w server -- --topic filing_reminder --template product-update-2026-06 --to you@example.com

# 3. The real send
npm run broadcast -w server -- --topic filing_reminder --template product-update-2026-06 --send
```

Topics: `filing_reminder`, `broker_revolut`, `broker_ibkr`, `prior_years`. The same template can be sent to several topics by running step 3 once per topic; recipients subscribed to multiple topics will get one email per topic, so for overlapping announcements pick the single most relevant topic instead.

Recipient selection is always: confirmed (`confirmedAt` set) and not unsubscribed (`unsubscribedAt` null). Every email carries the subscriber's one-click unsubscribe link in the body and a `List-Unsubscribe` header. Sends are throttled (600ms apart) and a failed recipient never aborts the rest; the summary line reports sent/failed counts and the exit code is non-zero if anything failed.

## Send history

Resend's dashboard (resend.com, the InvesTax account) is the send log; the CLI keeps no database state. After a real send, note it in the session log entry of the session that ran it.
