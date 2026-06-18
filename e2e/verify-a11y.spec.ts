import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Accessibility audit: runs axe-core against EVERY public route in both
// Romanian and English locales. Fails on any WCAG 2.1 A or AA violation.
//
// Part of PR-A of the launch-verification tooling
// (09-backlog-and-discipline.md Section 8.1 item #15); route coverage widened
// to the full public surface (incl. the /ghid SEO cluster, auth, legal, and
// account pages) by the weekly comprehensive-audit work.
//
// Pages are audited in their UNAUTHENTICATED state (e.g. /dashboard and
// /settings render their login prompt). We still do NOT audit authenticated
// user-state pages with real data (a real saved calculation, a parsed
// statement): those are too variable to assert on here.
//
// PAGES is the canonical public-route list shared in spirit with
// verify-i18n.spec.ts; keep the two in sync when routes are added or removed.

const PAGES = [
  // Marketing / core funnel
  '/',
  '/calculator',
  '/pricing',
  '/upload',
  '/dashboard',
  '/results',
  '/filing-guide',
  '/contact',
  // Auth (unauthenticated state)
  '/login',
  '/signup',
  '/forgot-password',
  // Account / status / legal
  '/settings',
  '/status',
  '/privacy',
  '/terms',
  // SEO guide cluster (/ghid), the organic-traffic surface
  '/ghid',
  '/ghid/declaratie-unica-trading212',
  '/ghid/declaratie-unica-revolut',
  '/ghid/declaratie-unica-ibkr',
  '/ghid/cass-investitii',
  '/ghid/dividende-broker-strain',
  '/ghid/cum-completez-declaratia-unica',
  '/ghid/cum-calculam',
  '/ghid/notificare-anaf-venituri-strainatate',
  '/ghid/impozit-xtb',
];

const LOCALES = ['en', 'ro'] as const;

test.describe('Accessibility (axe-core, WCAG 2.1 AA)', () => {
  for (const locale of LOCALES) {
    for (const path of PAGES) {
      test(`${path} [${locale}] has no WCAG 2.1 AA violations`, async ({ page }) => {
        // The app picks locale from localStorage ('language' key). Seed it
        // before any page code runs so initial render is in the target locale.
        await page.addInitScript((lng) => {
          window.localStorage.setItem('language', lng);
        }, locale);

        await page.goto(path);
        // Wait for the app shell to render so axe has something real to scan.
        await page.waitForLoadState('networkidle');

        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();

        expect.soft(results.violations, formatViolations(results.violations)).toEqual([]);
        expect(results.violations.length).toBe(0);
      });
    }
  }
});

function formatViolations(violations: { id: string; help: string; nodes: { target: unknown }[] }[]): string {
  if (violations.length === 0) return '';
  return violations
    .map((v) => `${v.id}: ${v.help} (${v.nodes.length} node${v.nodes.length === 1 ? '' : 's'})`)
    .join('\n');
}
