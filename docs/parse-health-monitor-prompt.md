# Parse Health Monitor (prompt template)

Prompt template for a scheduled InvesTax routine that summarises `ParseAlertLog`
activity over the last 6 hours and emails Dragos when anomalies fire.

## How to activate

This file is a stored prompt, not a live cron job. Dragos creates the actual
scheduled task once via the `schedule` skill:

```
/schedule create-scheduled-task
```

Pass the prompt body below as the task prompt, and pick a 6-hour cron expression
(e.g. `0 */6 * * *` for top-of-hour). The task name should be
`investax-parse-health-monitor`.

Re-run `/schedule list-scheduled-tasks` to confirm registration. Deactivation is
`/schedule delete-scheduled-task` by ID.

## Prompt body (paste this into the scheduled-task prompt field)

```
You are the InvesTax parse health monitor. Your job is to inspect
ParseAlertLog rows from the last 6 hours and email Dragos if anything looks
abnormal.

SSH to investax@178.104.152.247 and run these queries against the SQLite
production database at /home/investax/app/server/prisma/dev.db (or whichever
path DATABASE_URL points to on prod):

1. Bucket counts (last 6h):
   SELECT outcome, COUNT(*) FROM ParseAlertLog
   WHERE parsedAt > datetime('now', '-6 hours')
   GROUP BY outcome;

2. Warning + error detail (last 6h, capped):
   SELECT id, parsedAt, outcome, fileType, fileName,
          parserWarnings, engineWarnings, errorMessage
   FROM ParseAlertLog
   WHERE outcome IN ('warning', 'error')
     AND parsedAt > datetime('now', '-6 hours')
   ORDER BY parsedAt DESC
   LIMIT 20;

3. Volume sanity (last 24h vs prior 24h) to surface unusual spikes or drops:
   SELECT
     SUM(CASE WHEN parsedAt > datetime('now', '-24 hours') THEN 1 ELSE 0 END) AS last_24h,
     SUM(CASE WHEN parsedAt BETWEEN datetime('now', '-48 hours')
                                AND datetime('now', '-24 hours') THEN 1 ELSE 0 END) AS prev_24h
   FROM ParseAlertLog;

Decide if an anomaly fired. The bar:
- ANY 'error' outcome in the last 6h is an anomaly.
- 'warning' count > 3 in the last 6h is an anomaly.
- last_24h volume more than 3x prev_24h OR less than 1/3 of prev_24h is an
  anomaly worth flagging.

If an anomaly fired, email cosminifrim19+investax@gmail.com via the existing
Resend wiring on the VPS. Subject:
  [InvesTax] Parse health anomaly: <one-line summary>
Body: include the bucket counts, the top 5 warning rows with their warning
strings, and a one-line action recommendation.

If nothing anomalous, do not send email. Print a short OK line to stdout so
the routine log records the check ran.

Constraints:
- Do not modify any DB row. Read-only.
- Do not run prisma migrate, npm install, or pm2 restart.
- Do not include personally identifiable info in the email body beyond
  fileName and the warning strings themselves. No user emails, no security
  names.
- Cap the email at 4 KB. If output exceeds this, truncate the warning detail
  list and note the truncation.
```

## Why Resend (not Slack or a polled log)

Session #71 decision: Dragos picked Resend email to his InvesTax inbox. The
existing Resend wiring on the VPS already delivers the per-event parse alerts
from `sendParseAlertNotification`, so reusing it costs nothing. Slack or
Discord would have required new webhook setup; polling a log file would have
defeated the "monitor while I sleep" goal.

## When the email channel becomes too noisy

If Dragos starts ignoring these emails, the next move is to add structural
filtering inside the prompt (e.g. only alert on the same warning class twice
in a 24h window). Do that before swapping channels.
