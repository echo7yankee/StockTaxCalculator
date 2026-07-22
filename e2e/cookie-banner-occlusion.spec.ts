import { test, expect, type Page } from '@playwright/test';
import path from 'path';

// SUGGESTIONS S9: on a fresh visit the fixed cookie banner used to cover the
// pay CTA on /verifica-extras at the moment the verdict rendered (qa's
// screenshot from the PR #265 review). The contract pinned here:
//  1. when a parse outcome lands, the CTA sits fully ABOVE the banner (the
//     page auto-scrolls it clear; scroll-padding-bottom carries the banner's
//     published height);
//  2. the banner reserves in-flow space (spacer), so bottom-of-page content
//     can always scroll clear of the overlay at any viewport;
//  3. dismissing the banner removes the overlay, the spacer and the CSS var.
//
// The E2E storage state seeds only `language` (playwright.config.ts), so the
// banner is visible by default in every fresh context. Fixture rule (session
// #210): buys cover sells and all dates sit in the engine-supported year, so
// the gate stays OPEN and the unlock CTA is the element under test.

const PDF_PATH = path.resolve(__dirname, '..', 'test-data', 'annual-statement-2025.pdf');

const HEADER = 'Date,Ticker,Type,Quantity,Price per share,Total Amount,Currency,FX Rate';
const CLEAN_ROWS = [
  '2025-02-01T10:00:00.000Z,MSFT,BUY - MARKET,10,$100,$1000,USD,1',
  '2025-03-04T10:00:00.000Z,MSFT,SELL - MARKET,5,$120,$600,USD,1',
];

function csvFile(name: string, rows: string[]) {
  return {
    name,
    mimeType: 'text/csv',
    buffer: Buffer.from([HEADER, ...rows].join('\n'), 'utf-8'),
  };
}

async function driveCleanParse(page: Page) {
  await page.goto('/verifica-extras');
  await page.getByRole('button', { name: /CSV/ }).click();
  await page.getByRole('button', { name: /Revolut/ }).click();
  await expect(page.getByRole('button', { name: /Revolut/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page
    .locator('input[type="file"]')
    .setInputFiles(csvFile('revolut-clean.csv', CLEAN_ROWS));
  await expect(page.getByTestId('preview-result')).toBeVisible({ timeout: 15_000 });
}

test.describe('/verifica-extras cookie banner vs pay CTA (S9)', () => {
  test('the pay CTA lands fully clear of the banner when the verdict renders', async ({
    page,
  }) => {
    await driveCleanParse(page);

    const banner = page.getByTestId('cookie-banner');
    await expect(banner).toBeVisible();
    const cta = page.getByTestId('preview-unlock-cta');
    await expect(cta).toBeVisible();

    // The auto-scroll is applied in an effect; poll the geometry until settled.
    await expect
      .poll(
        async () => {
          const ctaBox = await cta.boundingBox();
          const bannerBox = await banner.boundingBox();
          if (!ctaBox || !bannerBox) return false;
          return ctaBox.y + ctaBox.height <= bannerBox.y;
        },
        { message: 'pay CTA should sit fully above the cookie banner overlay' },
      )
      .toBe(true);

    // And it is genuinely clickable with the banner up (no overlay interception).
    await cta.click({ trial: true });
  });

  test('the banner reserves in-flow space matching its height and releases it on dismiss', async ({
    page,
  }) => {
    await driveCleanParse(page);

    const banner = page.getByTestId('cookie-banner');
    const spacer = page.getByTestId('cookie-banner-spacer');
    const bannerBox = await banner.boundingBox();
    const spacerBox = await spacer.boundingBox();
    expect(bannerBox).not.toBeNull();
    expect(spacerBox).not.toBeNull();
    // The spacer mirrors the overlay's height (rounding tolerance only), so
    // max-scroll can always clear the overlay regardless of footer height.
    expect(Math.abs(spacerBox!.height - bannerBox!.height)).toBeLessThanOrEqual(1);

    const paddedScrollHeight = await page.evaluate(
      () => document.documentElement.scrollHeight,
    );

    await page.getByRole('button', { name: /Got it|Am înțeles/ }).click();
    await expect(banner).toHaveCount(0);
    await expect(spacer).toHaveCount(0);
    // The published height var is cleaned up with the banner.
    const varValue = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue('--cookie-banner-height'),
    );
    expect(varValue).toBe('');
    // Page shrinks by the released spacer height.
    const shrunkScrollHeight = await page.evaluate(
      () => document.documentElement.scrollHeight,
    );
    expect(paddedScrollHeight - shrunkScrollHeight).toBeGreaterThanOrEqual(
      Math.floor(spacerBox!.height) - 1,
    );
  });

  // S20-N1: the tests above drive the CSV/Revolut path; this variant pins the
  // identical geometry contract on the Trading212 PDF flow (the default tab and
  // the recommended path), using the committed fixture statement. Same S9
  // mechanics under test: on-parse scroll + scroll-padding from the published
  // banner height.
  test('PDF tab: the pay CTA lands fully clear of the banner when the verdict renders', async ({
    page,
  }) => {
    await page.goto('/verifica-extras');
    // No tab click: PDF is the default tab on /verifica-extras.
    await page.locator('input[type="file"]').setInputFiles(PDF_PATH);
    await expect(page.getByTestId('preview-result')).toBeVisible({ timeout: 15_000 });

    const banner = page.getByTestId('cookie-banner');
    await expect(banner).toBeVisible();
    const cta = page.getByTestId('preview-unlock-cta');
    await expect(cta).toBeVisible();

    await expect
      .poll(
        async () => {
          const ctaBox = await cta.boundingBox();
          const bannerBox = await banner.boundingBox();
          if (!ctaBox || !bannerBox) return false;
          return ctaBox.y + ctaBox.height <= bannerBox.y;
        },
        { message: 'pay CTA should sit fully above the cookie banner overlay (PDF tab)' },
      )
      .toBe(true);

    await cta.click({ trial: true });
  });

  test('mobile viewport: the CTA still lands clear of the (taller) banner', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await driveCleanParse(page);

    const banner = page.getByTestId('cookie-banner');
    const cta = page.getByTestId('preview-unlock-cta');
    await expect(cta).toBeVisible();
    await expect
      .poll(
        async () => {
          const ctaBox = await cta.boundingBox();
          const bannerBox = await banner.boundingBox();
          if (!ctaBox || !bannerBox) return false;
          return ctaBox.y + ctaBox.height <= bannerBox.y;
        },
        { message: 'pay CTA should sit fully above the banner at 375px' },
      )
      .toBe(true);
  });
});
