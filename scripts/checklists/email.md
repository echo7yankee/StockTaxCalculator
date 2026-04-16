# Email deliverability + rendering checklist

Target: transactional emails sent from `hello@investax.app` (via Resend once
live). Test receiving the email in three clients: Gmail web desktop,
Apple Mail on iOS, Gmail mobile on Android.

> **Blocked until Resend is live.** If you run this checklist today most items
> will be `S` (skip) — that is expected. The prompter still drops a report so
> you can see exactly what is outstanding.

Each item is independent. Capture a one-line note on failure when prompted.

---

## Items

1. **Welcome email arrives in INBOX, not SPAM.** Create a new account with
   email/password. Check Gmail web → Primary tab within 2 minutes.

2. **Welcome email sender is `hello@investax.app`.** Display name reads
   "InvesTax" (or similar), not a random SendGrid / Resend-default string.

3. **Welcome email passes SPF + DKIM + DMARC.** Gmail → view original → all
   three authentication checks show `PASS`.

4. **Welcome email renders correctly in Gmail web desktop.** Layout intact, no
   broken images, unsubscribe link present and working, all links point to
   `investax.app` (not localhost or a Resend preview URL).

5. **Welcome email renders correctly in iOS Mail.** Open the same email on an
   iPhone via Apple Mail. Fonts, spacing, logo all present. No "Load remote
   content" prompt stuck permanently.

6. **Welcome email renders correctly in Android Gmail.** Same email in Gmail
   for Android. Dark-mode rendering readable, no inverted logo weirdness.

7. **Password reset email arrives in INBOX.** Trigger "Forgot password" on
   `/login` → check Gmail inbox within 2 minutes.

8. **Password reset token link works exactly once.** Click the link, set a new
   password, then click the SAME link again — must show "token expired" or
   "already used", never reset the password again.

9. **Password reset email expires after 1 hour.** Request a reset, wait >60
   minutes, then click the link. Must show expired message, not let you reset.

10. **Payment confirmation email arrives (LS live mode only).** After a real
    test payment, confirmation arrives within 2 minutes with correct product
    name, price, and Dragos's PFA details for invoicing.

11. **No email leaks Trading212 data, CNP, or IBAN.** Open all three
    transactional templates source — body must contain no PII beyond the
    recipient's email + display name.

12. **Reply-to address reaches Dragos.** Reply to any transactional email.
    Reply-to should be `support@investax.app` (or equivalent) and land in
    Dragos's inbox.

---

## Out of scope for this checklist

- Outbound marketing emails (none exist yet — out of scope until post-launch)
- Mailing list / newsletter mechanics
- IMAP-based automated polling of inbox (see item #14 in backlog, not yet
  built — deliberately deferred until Resend is live)
