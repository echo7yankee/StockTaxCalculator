# Android Chrome manual verification checklist

Target: Android 12+ with Chrome 120+. Test against https://investax.app unless
you are staging a pre-launch build on a different URL.

Each item is independent. If you fail one, capture a one-line note when the
prompter asks.

---

## Items

1. **Chrome version ≥ 120.** Chrome → three-dot menu → Settings → About
   Chrome. Older versions miss some CSS features used on the pricing page.

2. **Landing page renders without horizontal scroll.** Open `/`. Swipe left and
   right — no overflow, hero fully visible on narrow viewports.

3. **Header auth cluster does not jump.** Reload `/` with Chrome DevTools
   remote-debugging throttled to Fast 3G. Header skeleton holds the slot until
   login/signup or avatar renders.

4. **Pricing promo + price do not flash.** `/pricing` on Fast 3G goes straight
   from skeleton → final price, no €19 → €12 flash.

5. **Calculator inputs open the numeric keyboard.** Focus a currency field on
   `/calculator`. Chrome should show a numeric keypad (`inputMode="decimal"`).

6. **Chrome password autofill works on signup.** Chrome offers to save the
   password after signup. Next login the password is offered via the
   autofill bar. No "Use password" prompt loop.

7. **Password field accepts paste.** Long-press → Paste into the password
   field on `/signup`. A password-manager autofill (Bitwarden, 1Password
   Android) also works — prompter will note which one was tested.

8. **Google OAuth redirect returns cleanly.** Click "Sign in with Google" on
   `/login`. Google account chooser → consent → back to InvesTax → session
   active → `/dashboard` loads. No redirect loop.

9. **Paywall redirect works.** As a free user, tap `/upload`. You should land
   on `/pricing` (or `/pricing?from=upload`), not a blank screen or raw 403.

10. **Dark-theme `prefers-color-scheme` is honoured.** Enable system dark mode
    in Android Settings → Display. Reload `/` — page must switch to dark theme
    without a manual toggle, and switch back when system is set to light.

11. **WebView vs Chrome parity.** Open InvesTax from a link in Gmail (opens in
    Chrome Custom Tab or WebView depending on device). Layout must match
    opening it directly in Chrome — no clipped hero, no broken header.

12. **404 page renders correctly.** Navigate to `/nonexistent-path-test`. The
    branded 404 with the "Înapoi acasă" CTA renders. No white screen.

---

## Out of scope for this checklist

- Real payment flow testing (backlog item #14, separate harness)
- Email deliverability (covered by `email.md`)
- Lighthouse scores (covered by `npm run verify:prod`)
- iOS Safari (covered by `ios.md`)
