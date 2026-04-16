import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Accessibility audit: runs axe-core against the 8 marketing / public pages
// in both Romanian and English locales. Fails on any WCAG 2.1 A or AA
// violation.
//
// Part of PR-A of the launch-verification tooling
// (09-backlog-and-discipline.md Section 8.1 item #15).
//
// DO NOT audit user-state pages (Dashboard with real data, Results with a
// real calculation, etc.) — those are out of PR-A scope per the spec.

const PAGES = [
  '/',
  '/calculator',
  '/pricing',
  '/upload',
  '/dashboard',
  '/results',
  '/filing-guide',
  '/contact',
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
