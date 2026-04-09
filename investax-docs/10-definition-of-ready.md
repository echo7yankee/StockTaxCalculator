# Definition of Ready & Reminders

> **Part of the InvesTax launch plan documentation set.**
> See `00-INDEX.md` for navigation.
> Previous file: see index | Next file: see index

---

## SECTION 9 — DEFINITION OF "READY TO LAUNCH"

The code agent should consider InvesTax ready for public launch ONLY when ALL of these are checked:

- [ ] All Section 5 test scenarios pass on production
- [x] **Rebrand StockTax → InvesTax fully complete (Section 3.0)** — PR #15
- [x] **No remaining "StockTax" references visible in UI, emails, or external services** — PR #15
- [ ] **AUTHENTICATION (Section 3.7): Google OAuth signup and login work end-to-end**
- [ ] **AUTHENTICATION: Email/password signup with verification email works end-to-end**
- [x] **AUTHENTICATION: Email/password login works, with rate limiting after 5 failed attempts** — PR #22 (tightened to 5/15min)
- [x] **AUTHENTICATION: Password reset flow works end-to-end with token expiry** — PR #22 (full flow, 1hr token expiry, session invalidation; email sending blocked on Resend setup)
- [x] **AUTHENTICATION: Account linking works (Google + email same address → one user)** — was already working (passport.ts account linking logic)
- [ ] **AUTHENTICATION: All 22 items in Section 3.7.5 auth checklist pass**
- [ ] **AUTHENTICATION: Tested by Dragos personally on his own phone with both methods**
- [x] **FORM VALIDATION (Section 3.8): Every form audited and passing the 24-item checklist in Section 3.8.5** — PR #23 (all 9 forms audited: signup, login, forgot-password, reset-password, change-password, calculator, upload, contact, delete-account)
- [x] **FORM VALIDATION: Server-side validation matches client-side validation (Zod schema shared)** — PR #23 (structured per-field errors from Zod, ApiError class propagates field errors to UI)
- [x] **FORM VALIDATION: All error messages localized (RO + EN)** — PR #23 (validation.required, invalidEmail, emailTooLong, commonPassword, passwordStrength in both languages)
- [x] **FORM VALIDATION: Mobile inputs at 16px font, no iOS auto-zoom** — PR #23 (`.input` CSS class uses text-base/16px, inputMode="decimal" for calculator)
- [x] **FORM VALIDATION: Test scenarios I, J, K from Section 5 all pass** — PR #27 (56 new E2E tests: Scenario I auth validation, Scenario J calculator validation, Scenario K upload/contact validation)
- [x] **Payment infrastructure built: /pricing page, paywall, webhook, DB schema** — PR #24 (blocked on Dragos providing LS credentials to go live)
- [ ] Real payment processed end-to-end with Dragos's own card (then refunded)
- [ ] At least 3 testimonials collected from soft launch and added to landing page
- [x] Privacy policy and Terms of Service published and linked from footer — PR #17/#18/#19
- [x] **Contact page (`/contact`) live and linked from footer of every page** — PR #17/#18/#19
- [ ] **Contact page email links work and have been tested with a real message**
- [x] GDPR delete-account flow works — PR #19 (delete-account + data export endpoints, typed DELETE confirmation UI)
- [x] Cookie banner (essential cookies disclosure) — PR #19
- [ ] Plausible Analytics tracking events fire correctly (verified in dashboard)
- [ ] Sentry capturing errors (verified by triggering a test error)
- [ ] UptimeRobot pinging successfully every 5 minutes
- [ ] Daily database backups running and verified restorable
- [ ] Email infrastructure working (welcome + payment confirmation emails delivered)
- [ ] PDF flow tested with at least 3 different real Trading212 statements
- [x] CSV flow gated behind "advanced" tab with stock split warning visible — PR #20
- [x] **Romanian and English translations complete on all new pages** — PR #28 (full audit: 0 missing keys across 36 files, hardcoded aria-labels translated, "or" dividers i18n'd)
- [x] **Mobile responsiveness audit complete (Section 3.6 checklist 100% passed)** — PR #16
- [ ] **Dragos personally re-tested on his own phone and confirmed all original bugs fixed**
- [ ] **Lighthouse mobile score ≥ 90 across all categories**
- [x] **No console errors in browser DevTools on any page (mobile or desktop)** — PR #28 (audit: 0 client-side console.log leaks, all client code clean)
- [x] **TAX YEAR SCOPING (Section 3.7): All rate mentions scoped to tax year 2025, Legea 239/2025 disclaimer added** — PR #30
- [ ] Tested on iOS Safari (real device or simulator)
- [ ] Tested on Android Chrome (real device or simulator)
- [ ] Accountant/SOLO consultation completed if needed
- [ ] PFA registration submitted via SOLO OR Lemon Squeezy account verified for individual onboarding
- [ ] **Authentication audit complete (see Section 9.1 below)**
- [x] **Form validation audit complete (see Section 9.2 below)** — PR #23

---

## SECTION 9.1 — AUTHENTICATION AUDIT (CRITICAL LAUNCH BLOCKER)

**Auth must work flawlessly across both Google OAuth and email/password ("classic") flows. Auth bugs are launch-killing because users who can't log in immediately bounce and never come back.**

### Both auth methods must work:

**Google OAuth:**
- [ ] "Sign in with Google" button visible on signup and login pages (desktop AND mobile)
- [ ] Click → redirects to Google's consent screen
- [ ] After consent → redirects back to InvesTax with valid session
- [ ] User record created in database with correct fields (email, name, googleId, plan="free")
- [ ] If user already exists with that email → log them in instead of creating duplicate
- [ ] Welcome email sent on first signup, NOT on subsequent logins
- [ ] Logout actually destroys the session (verify with DevTools → cookies)
- [ ] Re-login works without errors
- [ ] OAuth callback URL correctly configured for production domain (https://investax.app/auth/google/callback)
- [ ] Google OAuth client ID and secret stored in env vars, NOT hardcoded
- [ ] Test: log in with Google, log out, log in again → session works each time
- [ ] Test: log in with Google on mobile (Chrome and Safari) → flow completes without errors
- [ ] Test: revoke access via Google account settings → next login prompts for consent again

**Classic email/password:**
- [ ] Signup form: email + password + (optional) name
- [ ] Login form: email + password
- [ ] Password requirements clearly stated (min 8 chars, no max limit, no arbitrary character requirements)
- [ ] Passwords hashed with bcrypt (cost factor ≥ 12) or argon2, NEVER stored in plaintext
- [ ] Failed login returns generic error ("Email sau parolă incorectă") — does NOT reveal whether email exists
- [ ] Rate limiting on login attempts (max 5 failed attempts per IP per 15 min) — prevents brute force
- [ ] Password reset flow works:
  - [ ] User enters email on "forgot password" page
  - [ ] System sends reset email with unique token (expires in 1 hour)
  - [ ] User clicks link, sets new password
  - [ ] Old sessions invalidated after password change
- [ ] Email verification on signup (optional but recommended): send verification link, user must click before account is fully active
- [ ] Test: signup with new email → account created, login works
- [ ] Test: signup with already-used email → friendly error message
- [ ] Test: login with wrong password → generic error, no info leak
- [ ] Test: 5 failed logins → rate limit kicks in
- [ ] Test: password reset → new password works, old password doesn't

**Cross-method considerations:**
- [ ] User who signed up with Google CANNOT also log in with email/password unless they explicitly add a password to their account
- [ ] User who signed up with email/password CAN later link Google OAuth to the same account
- [ ] Account merging logic clearly defined (or explicitly prevented with friendly error)
- [ ] No user can have two accounts with the same email address

**Session management:**
- [ ] Sessions stored securely (httpOnly cookies, secure flag in production, sameSite=lax)
- [ ] Session expiration: reasonable default (e.g., 30 days) with sliding renewal on activity
- [ ] Logout button visible from every page once logged in
- [ ] Session works across page refreshes and browser restarts
- [ ] Multiple concurrent sessions allowed (user can be logged in on phone and desktop)

**Mobile-specific auth checks:**
- [ ] Google OAuth flow works on iOS Safari (notoriously picky with redirects)
- [ ] Google OAuth flow works on Android Chrome
- [ ] Email/password forms have correct mobile keyboard hints (`type="email"`, `autocomplete="email"`, `autocomplete="current-password"`, `autocomplete="new-password"`)
- [ ] Password fields support paste (for password manager users)
- [ ] No iOS auto-zoom on input focus (font size ≥ 16px)

**Error handling:**
- [ ] Network failure during login → friendly error message, not blank screen
- [ ] OAuth provider down → fallback message ("Google login is temporarily unavailable, please use email/password")
- [ ] Database error during signup → user sees friendly message, error logged to Sentry
- [ ] All auth-related errors logged to Sentry with context (NOT including passwords or tokens)

**Manual verification by Dragos before declaring done:**
- [ ] Dragos creates a new account with Google OAuth → works end-to-end
- [ ] Dragos creates a new account with email/password → works end-to-end
- [ ] Dragos logs out and logs back in with both methods → works each time
- [ ] Dragos tests on his own phone → both flows work without errors

---

## SECTION 9.2 — FORM VALIDATION AUDIT (CRITICAL LAUNCH BLOCKER)

**Every form in InvesTax must have correct, consistent, user-friendly validation. Bad validation produces frustrated users who abandon the product.**

### Forms that need validation (audit each one):

1. **Signup form** (email/password)
2. **Login form**
3. **Password reset request form**
4. **Password reset (new password) form**
5. **Quick calculator form** (manual tax calculator)
6. **PDF/CSV upload form**
7. **Contact form** (if implemented)
8. **Account settings form** (delete account, change password, etc.)
9. **Pricing/checkout flow** (Lemon Squeezy handles most of this)

### Validation requirements (apply to ALL forms):

**Client-side validation (UX layer):**
- [ ] Validation happens on blur (when user leaves a field), NOT only on submit
- [ ] Inline error messages appear directly under the relevant field, not in a top banner
- [ ] Error messages are specific and actionable, NOT generic
  - Bad: "Invalid input"
  - Good: "Email-ul trebuie să conțină un caracter @"
- [ ] Error messages are in the user's language (Romanian if RO version, English if EN)
- [ ] Error messages disappear automatically when the user fixes the problem
- [ ] Submit button is disabled while there are validation errors (or shows them on click)
- [ ] Loading state on submit button while request is in flight (prevents double-submit)

**Server-side validation (security layer):**
- [ ] **EVERY form is validated on the server**, not just client-side
- [ ] Use Zod or similar schema validation library for consistency
- [ ] Server returns structured validation errors (per-field) that the client can display
- [ ] Server NEVER trusts client-side validation alone — assume the client is malicious
- [ ] Server rejects unknown/extra fields (whitelist, not blacklist)
- [ ] Server enforces type coercion safely (e.g., a number field doesn't accept "abc")

**Per-field validation rules:**

**Email fields:**
- [ ] Must contain @ and at least one dot after @
- [ ] Case-insensitive (store lowercased)
- [ ] Max length 254 chars (RFC limit)
- [ ] No leading/trailing whitespace
- [ ] Use a proper email regex (the simple one, not the RFC-compliant 700-char monster)

**Password fields:**
- [ ] Min 8 characters
- [ ] No max length (or at least 128 — accommodate password managers)
- [ ] No silly character requirements ("must have 1 uppercase, 1 number, 1 symbol") — these reduce security in practice
- [ ] Show strength indicator (weak/medium/strong) for user feedback
- [ ] "Show password" toggle (eye icon) — helps mobile users avoid typos
- [ ] Confirm password field for signup (not for login)
- [ ] Compare against common passwords list (top 1000) — reject "password123", "qwerty", etc.

**Numeric fields (calculator inputs):**
- [ ] Accept both `.` and `,` as decimal separators (Romanian convention is `,`, English is `.`)
- [ ] Reject negative numbers where they don't make sense (e.g., capital gains can be negative, but tax owed cannot)
- [ ] Display formatting in user's locale (1,234.56 for EN, 1.234,56 for RO)
- [ ] Max value sanity checks (reject obviously wrong inputs like 999999999999)
- [ ] Empty field handling: clear error message, not silent failure

**File upload fields:**
- [ ] File type whitelist (only .pdf, .csv accepted)
- [ ] Max file size (10MB recommended for PDFs, 5MB for CSVs)
- [ ] Reject empty files
- [ ] Show filename and size after selection
- [ ] Show clear error if file is rejected ("Fișierul trebuie să fie PDF sau CSV, max 10MB")
- [ ] Drag-and-drop support on desktop
- [ ] Tap-to-select on mobile (works with iOS Files app and Android file picker)

**Text fields (name, message, etc.):**
- [ ] Reasonable max length (50 for names, 2000 for messages)
- [ ] Strip leading/trailing whitespace
- [ ] Reject empty submissions
- [ ] HTML escape on display (prevent XSS)
- [ ] No HTML allowed in user-submitted text (server strips or escapes it)

### Specific form audits:

**Quick calculator form:**
- [ ] All numeric inputs accept Romanian decimal format (`,`)
- [ ] CASS calculation handles edge cases (income just below/above bracket thresholds)
- [ ] Empty optional fields don't break the calculation
- [ ] Negative net gain (loss) is handled correctly
- [ ] Currency selector (RON/EUR/USD) works correctly
- [ ] Result clearly shows: total tax owed, breakdown by category, CASS bracket

**Upload form (PDF/CSV):**
- [ ] Tab switcher between PDF and CSV with PDF as default
- [ ] CSV tab shows the existing stock split warning prominently
- [ ] File picker opens correctly on mobile
- [ ] Upload progress indicator
- [ ] Clear error if file is malformed ("Acest fișier nu pare să fie un extras Trading212 valid")
- [ ] Backend validates file content, not just extension

**Contact form (if implemented):**
- [ ] All required fields enforced
- [ ] Email format validated
- [ ] Honeypot field for spam protection
- [ ] Rate limiting (max 3 submissions per IP per hour)
- [ ] Success message after submission
- [ ] Failure message with retry option

**Settings/account forms:**
- [ ] Delete account requires typed confirmation ("Type DELETE to confirm")
- [ ] Password change requires current password
- [ ] Email change requires email verification before applying

### Accessibility requirements:

- [ ] All form fields have associated `<label>` elements (not just placeholder text)
- [ ] Required fields marked with `*` AND `aria-required="true"`
- [ ] Error messages linked to fields with `aria-describedby`
- [ ] Submit buttons have descriptive text, not just "Submit"
- [ ] Tab order is logical (top to bottom, left to right)
- [ ] All forms usable with keyboard only (no mouse required)
- [ ] Focus indicators visible on all interactive elements

### Manual verification by Dragos before declaring done:

- [ ] Dragos tries to break each form intentionally:
  - Submitting empty
  - Submitting with invalid data in each field
  - Submitting valid data
  - Submitting same data twice rapidly
- [ ] Dragos tests file upload with: valid PDF, valid CSV, .txt file, 50MB file, empty file
- [ ] Dragos tests numeric inputs with: negative numbers, decimals with `,`, decimals with `.`, very large numbers, text in numeric fields
- [ ] Dragos tests on mobile (his phone) and confirms all forms are usable

---

## SECTION 10 — QUESTIONS THE CODE AGENT MIGHT HAVE

**Q: Should we use Stripe or Lemon Squeezy?**
A: Default to Lemon Squeezy unless Dragos confirms his PFA is registered and Stripe is onboarded. We can migrate later. Don't block on this decision.

**Q: Should the payment be subscription or one-time?**
A: One-time annual payment. Romanian users are subscription-fatigued and a once-a-year tax tool doesn't justify monthly billing. Year 2 we can offer auto-renew as an option, but never as default.

**Q: Should we add a free trial?**
A: No. The free calculator IS the trial. Adding a "free trial of paid features" creates confusion and credit-card-required friction. Free calc → paywall → purchase is cleaner.

**Q: What if a user finishes payment but the webhook fails?**
A: Implement a manual reconciliation endpoint: `/api/admin/sync-payments` that fetches recent orders from Lemon/Stripe API and updates user records. Run it manually if a user reports "I paid but don't have access."

**Q: Should we collect VAT?**
A: Lemon Squeezy handles VAT automatically (acts as merchant of record). If using Stripe, you need to either register for Romanian VAT (only required above 88,500 RON revenue) or use Stripe Tax (€0.40 per transaction, handles EU VAT compliance). Discuss with accountant.

**Q: What about invoicing?**
A: Lemon Squeezy auto-issues invoices. Stripe does not — you'd need to add invoice generation. For Romanian PFAs, invoices have specific format requirements. Consult accountant.

**Q: What's the support workflow?**
A: All support goes to `support@investax.app`. Dragos handles personally for the first 100 users. Response SLA: 24 hours during launch window (April 14 - May 25), 72 hours after.

---

## SECTION 11 — CRITICAL REMINDERS

1. **The PDF flow is the recommended path. Always.** Until stock splits are handled in CSV, the marketing and UI must steer users to PDF.

2. **One viral negative post can kill the product.** A user reporting "InvesTax told me 20k but I really owed 28k" on a Facebook group ends the launch. Test obsessively.

3. **The May 25 deadline is non-negotiable.** Every day after April 14 that the product isn't fully launched is lost revenue that won't come back until 2027.

4. **Trust > features.** Adding more brokers or fancy charts matters less than users believing the numbers are correct.

5. **Don't break what works.** The tax engine, BNR rate fetcher, and PDF parser are all working correctly. Do not refactor them. Add only what Section 2 and 3 require.

---

**End of document. Code agent: confirm receipt and outline your implementation plan before writing any code.**


---
