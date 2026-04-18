import { test, expect } from '@playwright/test';

// Visual regression: pixel-exact screenshot comparison for the stable marketing
// pages in both Romanian and English locales. 6 pages × 2 locales = 12 snapshots.
//
// Part of PR-C of the launch-verification tooling
// (09-backlog-and-discipline.md Section 8.1 item #15).
//
// STRICT 0 TOLERANCE: `maxDiffPixelRatio: 0` and `maxDiffPixels: 0` on every
// assertion. Dragos has observed that any non-zero tolerance misses real
// regressions. Rendering variability is handled via environment pinning
// (baselines generated and compared inside the Playwright Linux Docker image)
// and via masking dynamic regions (promo counter, footer year) — NOT via a
// diff budget.
//
// DO NOT add user-state pages (Dashboard with data, Results with a real
// calculation). Those are too variable for this discipline.
//
// DO NOT generate baselines on Windows or macOS. Use the `verify:visual:update`
// npm script, which runs inside the pinned Docker container.

const PAGES = [
  '/',
  '/pricing',
  '/filing-guide',
  '/privacy',
  '/terms',
  '/contact',
];

const LOCALES = ['en', 'ro'] as const;

test.describe('Visual regression (pixel-exact, 0 tolerance)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  for (const locale of LOCALES) {
    for (const path of PAGES) {
      test(`${path} [${locale}] matches baseline`, async ({ page }) => {
        // Seed locale before any page code runs so initial render is in the
        // target locale. Matches the approach used by verify-a11y.spec.ts and
        // verify-i18n.spec.ts.
        await page.addInitScript((lng) => {
          window.localStorage.setItem('language', lng);
        }, locale);

        await page.goto(path);
        await page.waitForLoadState('networkidle');

        await expect(page).toHaveScreenshot(`${safeName(path)}-${locale}.png`, {
          fullPage: true,
          animations: 'disabled',
          caret: 'hide',
          maxDiffPixels: 0,
          maxDiffPixelRatio: 0,
          mask: [
            page.locator('[data-testid="current-year"]'),
            page.locator('[data-testid="promo-badge"]'),
            page.locator('[data-testid="promo-badge-skeleton"]'),
            page.locator('[data-testid="price-skeleton"]'),
          ],
        });
      });
    }
  }
});

function safeName(path: string): string {
  return path === '/' ? 'root' : path.replace(/^\//, '').replace(/\//g, '_');
}
