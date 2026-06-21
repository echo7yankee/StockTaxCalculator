import { defineConfig } from '@playwright/test';

const baseURL = process.env.BASE_URL || 'http://localhost:5173';
const baseOrigin = new URL(baseURL).origin;
// Only manage the local dev servers when the audit target IS localhost. For a
// remote target (BASE_URL=https://investax.app, used by the weekly production
// audit and `npm run verify:prod`), the tests hit the deployed site directly,
// so spinning up local servers would add nothing but a failure surface. See the
// webServer field below.
const isLocalTarget = ['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname);

export default defineConfig({
  testDir: './e2e',
  // Visual regression has its own dedicated runner (.github/workflows/visual-baselines.yml
  // and scripts/verify-visual.ts). Skip it from generic E2E runs so a layout shift
  // from a recent copy/i18n PR doesn't block unrelated PRs in the main CI workflow.
  // The visual-baselines workflow does not set SKIP_VISUAL, so visual regression
  // still runs there as designed.
  testIgnore: process.env.SKIP_VISUAL ? ['**/visual-regression.spec.ts'] : [],
  timeout: 30_000,
  // E2E runs against a single shared dev server backed by one SQLite file. With
  // Playwright's default worker-per-core parallelism, concurrent workers race on
  // the @quixo3/prisma-session-store session table: a session read-modify-write
  // interleaves and Prisma throws "No record was found for an update", which
  // surfaces as an intermittent 401 on an authenticated spec (e.g. the
  // api-endpoints export-data test) and a false-red CI run (sessions #116/#120).
  // Serializing E2E in CI removes the contention at its source. Locally we cap
  // to 2 workers rather than Playwright's default (~half the CPU threads): each
  // worker launches its own Chromium on top of the Vite + API dev servers, so
  // on a high-core dev machine the default fans out to ~12 browsers and is a
  // multi-GB RAM hit. 2 keeps local feedback parallel without the storm.
  workers: process.env.CI ? 1 : 2,
  // Insurance for residual timing nondeterminism (networkidle waits, runner
  // load). Codifies the "if a run looks like flake, retry it" policy already
  // documented in .github/workflows/ci.yml so a transient blip no longer blocks
  // `gh pr merge --auto`. A genuinely broken test still fails every attempt, so
  // this absorbs transient blips, not real regressions.
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL,
    headless: true,
    screenshot: 'only-on-failure',
    // Force English UI in the E2E suite. Production defaults to Romanian
    // (PR #63 — SEO targeting Romanian Google results), but the E2E specs
    // were authored against English copy. Seeding localStorage.language='en'
    // for every browser context makes i18n pick English on first paint via
    // the localStorage detector, regardless of fallbackLng. Tests that want
    // to verify Romanian behavior can still override per-test.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: baseOrigin,
          localStorage: [{ name: 'language', value: 'en' }],
        },
      ],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: isLocalTarget
    ? [
        {
          command: 'npm run dev -w server',
          port: 3001,
          reuseExistingServer: true,
        },
        {
          command: 'npm run dev -w client',
          port: 5173,
          reuseExistingServer: true,
        },
      ]
    : undefined,
});
