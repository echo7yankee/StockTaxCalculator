import { test, expect, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import path from 'path';

// The S11 paid-surface contract (PR #272, SUGGESTIONS S18-N3): on /results and
// /filing-guide, only a BLOCKING parse warning (fatal severity / legacy fatal
// prose / engine #24C refusal) suppresses the paid output (D212 export, audit
// trail, filing CTA, copy-paste values). An info-severity warning renders as a
// non-blocking amber note with everything the customer paid for still present.
// Before S11 the pages gated on `parseWarnings.length > 0`, which hid the paid
// declaration behind the benign interest note (the paid-then-blocked shape one
// step past checkout). These tests pin the contract end-to-end through the real
// upload flow with the real T212 CSV parser:
//  - info-only file -> amber note, D212 + audit trail + filing CTA all PRESENT;
//  - fatal file -> red hard-stop + contact CTA, paid output suppressed;
//  - clean file -> no notice at all (the false-block / trust direction).
//
// Paid-user provisioning mirrors upload-pdf.spec.ts: signup via API, then flip
// the plan on the DB row directly (requirePaidPlan demands a FUTURE
// planExpiresAt, not just plan='paid' -- the #216 gotcha). Routing through a
// signed Stripe webhook would need STRIPE_WEBHOOK_SECRET, absent in CI.
//
// Fixture-building rule (session #210): neutralise every OTHER warning source
// so the one under test is the only signal. Buys cover sells (no
// missing-history guard) and all dates sit in the engine-supported year.

const uid = Date.now();
const PASSWORD = 'TestPass123!';
const PAID_EMAIL = `e2e-s11-paid-${uid}@example.com`;
const DB_PATH = path.resolve(__dirname, '..', 'server', 'prisma', 'dev.db');

// Real T212 CSV export header set (matches the unit-test fixture shape).
const HEADER =
  'Action,Time,ISIN,Ticker,Name,No. of shares,Price / share,Currency (Price / share),Exchange rate,Total,Withholding tax,Currency (Withholding tax),ID';
const BUY_ROW =
  'Market buy,2025-03-15T10:30:00Z,US0378331005,AAPL,Apple Inc.,10,150.50,USD,1,1505.00,0,USD,tx-001';
const SELL_ROW =
  'Market sell,2025-06-10T14:00:00Z,US0378331005,AAPL,Apple Inc.,5,160.00,USD,1,800.00,0,USD,tx-002';
// Info-severity warning: interest income is out of scope (t212_interest_income_out_of_scope).
const INTEREST_ROW =
  'Interest on cash,2025-04-01T00:00:00Z,,,,,,USD,,1.23,0,USD,tx-003';
// Fatal-severity warning: an unreadable numeric cell (t212_unreadable_numeric_value)
// would silently zero the sell proceeds = an under-stated declaration.
const UNREADABLE_SELL_ROW =
  'Market sell,2025-06-10T14:00:00Z,US0378331005,AAPL,Apple Inc.,5,160.00,USD,1,bogus,0,USD,tx-002';

function csvFile(name: string, rows: string[]) {
  return {
    name,
    mimeType: 'text/csv',
    buffer: Buffer.from([HEADER, ...rows].join('\n'), 'utf-8'),
  };
}

async function login(page: Page) {
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill(PAID_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/dashboard|pricing/, { timeout: 10_000 });
}

/** Upload a T212 CSV on /upload, run the engine, land on /results. */
async function uploadCsvToResults(page: Page, file: ReturnType<typeof csvFile>) {
  await page.goto('/upload');
  await page.getByRole('button', { name: /CSV Export/ }).click();
  // Round-trip on the pressed state before touching the file input: injecting
  // in the same tick as the tab switch races React's re-render (#214 gotcha).
  await expect(page.getByRole('button', { name: /Trading 212/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByText(file.name)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /Calculate Taxes/i }).click();
  await page.waitForURL(/\/results/, { timeout: 15_000 });
}

test.describe('S11 paid-surface contract (/results + /filing-guide)', () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/auth/signup', {
      data: { email: PAID_EMAIL, password: PASSWORD, name: 'S11 Paid User' },
    });
    expect(res.status()).toBe(201);
    const { user } = await res.json();
    expect(user?.id).toBeTruthy();

    const prisma = new PrismaClient({ datasources: { db: { url: `file:${DB_PATH}` } } });
    try {
      const planExpiresAt = new Date();
      planExpiresAt.setFullYear(planExpiresAt.getFullYear() + 1);
      await prisma.user.update({
        where: { id: user.id },
        data: { plan: 'paid', planPurchasedAt: new Date(), planExpiresAt },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  test('info-only warning: amber note, paid output all present on both surfaces', async ({
    page,
  }) => {
    await login(page);
    await uploadCsvToResults(page, csvFile('t212-interest.csv', [BUY_ROW, SELL_ROW, INTEREST_ROW]));

    // /results: non-blocking note, no red banner, everything paid-for present.
    await expect(page.getByTestId('parse-info-notice')).toBeVisible();
    await expect(page.getByTestId('parse-warning-banner')).toHaveCount(0);
    await expect(page.getByTestId('d212-download')).toBeVisible();
    await expect(page.getByTestId('audit-trail-download')).toBeVisible();
    await expect(page.getByTestId('filing-guide-cta')).toBeVisible();

    // /filing-guide via the CTA: same note, D212 values + PDF export present.
    await page.getByTestId('filing-guide-cta').click();
    await page.waitForURL(/\/filing-guide/, { timeout: 10_000 });
    await expect(page.getByTestId('filing-parse-info-notice')).toBeVisible();
    await expect(page.getByTestId('filing-parse-warning-banner')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Copy All' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download PDF' })).toBeVisible();
  });

  test('fatal warning: red hard-stop, paid output suppressed on both surfaces', async ({
    page,
  }) => {
    await login(page);
    await uploadCsvToResults(page, csvFile('t212-unreadable.csv', [BUY_ROW, UNREADABLE_SELL_ROW]));

    // /results: blocking banner + contact CTA; D212 / audit / filing CTA gone.
    await expect(page.getByTestId('parse-warning-banner')).toBeVisible();
    await expect(page.getByTestId('parse-warning-contact-cta')).toBeVisible();
    await expect(page.getByTestId('parse-info-notice')).toHaveCount(0);
    await expect(page.getByTestId('d212-download')).toHaveCount(0);
    await expect(page.getByTestId('audit-trail-download')).toHaveCount(0);
    await expect(page.getByTestId('filing-guide-cta')).toHaveCount(0);

    // /filing-guide must hard-stop on its own (it renders independently of
    // Results). Its CTA is suppressed here by design, so drive the SPA route
    // directly (pushState + popstate = react-router navigation) to reach the
    // page WITH the fatal parse context intact -- a hard page.goto would wipe
    // the in-memory UploadContext and render the unrelated no-data state.
    await page.evaluate(() => {
      window.history.pushState({}, '', '/filing-guide');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page.getByTestId('filing-parse-warning-banner')).toBeVisible();
    await expect(page.getByTestId('filing-parse-warning-contact-cta')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy All' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Download PDF' })).toHaveCount(0);

    // A hard URL load drops the in-memory parse context entirely; the page must
    // degrade to its no-data state with the paid output equally absent.
    await page.goto('/filing-guide');
    await expect(page.getByRole('button', { name: 'Copy All' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Download PDF' })).toHaveCount(0);
  });

  test('clean file: no notice, no banner, paid output present (no false block)', async ({
    page,
  }) => {
    await login(page);
    await uploadCsvToResults(page, csvFile('t212-clean.csv', [BUY_ROW, SELL_ROW]));

    await expect(page.getByTestId('d212-download')).toBeVisible();
    await expect(page.getByTestId('filing-guide-cta')).toBeVisible();
    await expect(page.getByTestId('parse-info-notice')).toHaveCount(0);
    await expect(page.getByTestId('parse-warning-banner')).toHaveCount(0);
  });
});
