# iOS Safari manual verification checklist

Target: iPhone SE or newer, iOS Safari 17+. Test against https://investax.app
unless you are staging a pre-launch build on a different URL.

Each item is independent. If you fail one, capture a one-line note when the
prompter asks — screenshots in `~/Downloads` and filed under `scripts/reports/`
are welcome but not required.

---

## Items

1. **Safari version ≥ 17.** Settings → General → About → Software Version is
   iOS 17.x or newer. Older Safari has known layout bugs on the landing hero.

2. **Landing page renders without horizontal scroll.** Open `/`. Swipe left and
   right — no overflow, no hidden content, hero headline fully visible.

3. **Header auth cluster does not jump.** Reload `/` on Fast 3G (Develop →
   Network Conditions). The skeleton placeholder should hold the top-right
   corner steady until login/signup buttons render.

4. **Pricing promo + price do not flash €19 → €12.** Open `/pricing` on Fast
   3G. The price slot should go straight from skeleton → final €12 (launch) or
   €19 (regular) without an intermediate €19 flash.

5. **Calculator inputs open the numeric keyboard.** Tap any currency field on
   `/calculator`. iOS should show a numeric (not full QWERTY) keyboard because
   the input uses `inputMode="decimal"`.

6. **No iOS auto-zoom on form focus.** Tap the email field on `/signup`. The
   page must not zoom in. Input font-size is 16px precisely to prevent this.

7. **Password field accepts paste.** Long-press the password field on
   `/signup`, choose Paste. 1Password / iCloud Keychain suggestions must also
   populate the field without errors.

8. **Pinch-to-zoom is disabled on forms.** Try to pinch-zoom the signup form.
   It should stay at 1.0 zoom (viewport meta `user-scalable=no` for the auth
   pages).

9. **Google OAuth redirect returns cleanly.** From a logged-out Safari tab,
   click "Sign in with Google" on `/login`. Google consent → back to InvesTax
   → session active → `/dashboard` loads. No "about:blank" intermediate, no
   error banner.

10. **Paywall redirect works.** As a free user, tap `/upload` in the nav. You
    should be redirected to `/pricing?from=upload` (or similar), not see a
    blank page or an API error.

11. **404 page renders correctly.** Navigate to `/nonexistent-path-test`. The
    branded 404 with the "Înapoi acasă" CTA should render. No white screen, no
    Express default text.

12. **Orientation change preserves layout.** Rotate the phone landscape while
    on `/pricing`. Content reflows, no clipped elements, no double scroll.

---

## Out of scope for this checklist

- Real payment flow testing (backlog item #14, separate harness)
- Email deliverability (covered by `email.md`)
- Lighthouse scores (covered by `npm run verify:prod`)
- Desktop Chrome / Firefox (not this checklist)
