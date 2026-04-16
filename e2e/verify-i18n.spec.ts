import { test, expect } from '@playwright/test';

// i18n completeness audit: loads every page in both locales, hooks the
// browser console, and fails if either (a) i18next emits a `missingKey`
// warning, or (b) the rendered DOM contains a raw `{{placeholder}}` token
// (which means a translation string had unresolved interpolation).
//
// Part of PR-A of the launch-verification tooling
// (09-backlog-and-discipline.md Section 8.1 item #15).

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

// Matches `{{anything}}` — the classic i18next interpolation syntax — that
// would only survive into the DOM if interpolation failed or the template
// itself is malformed.
const RAW_PLACEHOLDER_RE = /\{\{\s*[\w.]+\s*\}\}/;

test.describe('i18n completeness', () => {
  for (const locale of LOCALES) {
    for (const path of PAGES) {
      test(`${path} [${locale}] has no missing keys or raw placeholders`, async ({ page }) => {
        const missingKeyWarnings: string[] = [];

        page.on('console', (msg) => {
          const text = msg.text();
          if (text.includes('i18next::translator: missingKey')) {
            missingKeyWarnings.push(text);
          }
        });

        await page.addInitScript((lng) => {
          window.localStorage.setItem('language', lng);
        }, locale);

        await page.goto(path);
        await page.waitForLoadState('networkidle');

        // Assertion 1: no missingKey console warnings
        expect(missingKeyWarnings, `Missing i18n keys on ${path} [${locale}]:\n${missingKeyWarnings.join('\n')}`).toEqual([]);

        // Assertion 2: no raw `{{placeholder}}` survived into the DOM
        const bodyText = await page.locator('body').innerText();
        const rawMatch = bodyText.match(RAW_PLACEHOLDER_RE);
        expect(rawMatch, `Raw placeholder leaked into DOM on ${path} [${locale}]: ${rawMatch?.[0]}`).toBeNull();
      });
    }
  }
});
