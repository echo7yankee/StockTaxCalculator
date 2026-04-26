import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // Visual regression has its own dedicated runner (.github/workflows/visual-baselines.yml
  // and scripts/verify-visual.ts). Skip it from generic E2E runs so a layout shift
  // from a recent copy/i18n PR doesn't block unrelated PRs in the main CI workflow.
  // The visual-baselines workflow does not set SKIP_VISUAL, so visual regression
  // still runs there as designed.
  testIgnore: process.env.SKIP_VISUAL ? ['**/visual-regression.spec.ts'] : [],
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: [
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
  ],
});
