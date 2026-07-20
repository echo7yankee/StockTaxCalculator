import { test, expect, type Page } from '@playwright/test';

// Free pre-pay checker (/verifica-extras, backlog #24B): the fatal-warning block
// state had unit + browser-script coverage but no committed E2E (SUGGESTIONS S14
// note N3). These tests drive the real page with the real Revolut parser:
//  - a file carrying a never-seen income-bearing type (MERGER - CASH, the S14
//    case) must close the gate: contact CTA shown, unlock (pay) CTA absent;
//  - a clean file must keep the gate OPEN (the false-block / revenue direction).
// The checker is public (no login) and the parse is fully client-side.
//
// Fixture-building rule (session #210): neutralise every OTHER fatal reason so
// the unrecognised type is the only possible block. Buys cover sells (no
// missing-history stop) and all dates sit in the engine-supported year.

const HEADER = 'Date,Ticker,Type,Quantity,Price per share,Total Amount,Currency,FX Rate';
const CLEAN_ROWS = [
  '2025-02-01T10:00:00.000Z,MSFT,BUY - MARKET,10,$100,$1000,USD,1',
  '2025-03-04T10:00:00.000Z,MSFT,SELL - MARKET,5,$120,$600,USD,1',
];
const MERGER_ROW = '2025-03-06T10:00:00.000Z,ATVI,MERGER - CASH,,,$950,USD,1';

function csvFile(name: string, rows: string[]) {
  return {
    name,
    mimeType: 'text/csv',
    buffer: Buffer.from([HEADER, ...rows].join('\n'), 'utf-8'),
  };
}

/** Open /verifica-extras, switch to the CSV tab, and select the Revolut broker. */
async function openRevolutCsvTab(page: Page) {
  await page.goto('/verifica-extras');
  // Tab label contains "CSV" in both locales (RO "Export CSV" / EN "CSV Export").
  await page.getByRole('button', { name: /CSV/ }).click();
  await page.getByRole('button', { name: /Revolut/ }).click();
  await expect(page.getByRole('button', { name: /Revolut/ })).toHaveAttribute('aria-pressed', 'true');
}

test.describe('/verifica-extras pre-pay gate (Revolut CSV)', () => {
  test('fatal unrecognised-type warning closes the gate: contact CTA shown, pay CTA absent', async ({ page }) => {
    await openRevolutCsvTab(page);

    await page
      .locator('input[type="file"]')
      .setInputFiles(csvFile('revolut-merger-cash.csv', [...CLEAN_ROWS, MERGER_ROW]));

    await expect(page.getByTestId('preview-result')).toBeVisible({ timeout: 15_000 });
    // S6 phase B: the app defaults to Romanian (fallbackLng 'ro'; no querystring /
    // localStorage in a fresh Playwright context), so the warning renders the RO
    // template from parserWarnings.json, not the parser's English prose.
    await expect(page.getByText(/tipuri de tranzacții nerecunoscute/)).toBeVisible();
    // Gate CLOSED: contact-only capture, no unlock (pay) CTA anywhere.
    await expect(page.getByTestId('preview-contact-cta')).toBeVisible();
    await expect(page.getByTestId('preview-unlock-cta')).toHaveCount(0);
  });

  test('clean Revolut file keeps the gate open with the unlock CTA (no false block)', async ({ page }) => {
    await openRevolutCsvTab(page);

    await page.locator('input[type="file"]').setInputFiles(csvFile('revolut-clean.csv', CLEAN_ROWS));

    await expect(page.getByTestId('preview-result')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('preview-unlock-cta')).toBeVisible();
    await expect(page.getByTestId('preview-contact-cta')).toHaveCount(0);
  });
});
