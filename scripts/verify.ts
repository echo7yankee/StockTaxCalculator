#!/usr/bin/env tsx
/**
 * Launch-verification orchestrator (`npm run verify`).
 *
 * Runs the full local verification suite, or if `--prod` is passed, runs the
 * read-only checks against the live production site. Final exit code is the
 * union of every step's pass/fail.
 *
 * Steps:
 *   1. Unit tests            (npm test, all workspaces)         — local only
 *   2. Playwright E2E        (wraps existing suite + a11y + i18n specs)
 *   3. Lighthouse CI         (8 pages, Perf≥90/A11y=100/BP≥90/SEO≥95)
 *   4. Broken-link crawler   (depth 2 from root, internal only)
 *   5. Visual regression     (Docker-pinned Playwright, strict 0 tolerance)
 *
 * Flags:
 *   --prod              use https://investax.app as the BASE_URL
 *                       (auto-skips unit tests + visual regression)
 *   --base-url <url>    use a custom BASE_URL
 *   --skip-unit         skip unit tests
 *   --skip-e2e          skip Playwright
 *   --skip-lighthouse   skip Lighthouse
 *   --skip-links        skip broken-link crawler
 *   --skip-visual       skip visual regression
 *
 * Part of PR-A (core) + PR-C (visual regression) of the launch-verification
 * tooling (09-backlog-and-discipline.md Section 8.1 item #15).
 */

import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import chalk from 'chalk';

type StepResult = {
  name: string;
  passed: boolean;
  detail?: string;
};

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

const LH_THRESHOLDS = {
  performance: 90,
  accessibility: 100,
  'best-practices': 90,
  seo: 95,
};

function parseArgs(argv: string[]): {
  baseUrl: string;
  skipUnit: boolean;
  skipE2e: boolean;
  skipLighthouse: boolean;
  skipLinks: boolean;
  skipVisual: boolean;
  isProd: boolean;
} {
  const isProd = argv.includes('--prod');
  let baseUrl = isProd ? 'https://investax.app' : 'http://localhost:5173';
  const customIdx = argv.indexOf('--base-url');
  if (customIdx >= 0 && argv[customIdx + 1]) {
    baseUrl = argv[customIdx + 1];
  }
  return {
    baseUrl,
    skipUnit: argv.includes('--skip-unit') || isProd,
    skipE2e: argv.includes('--skip-e2e'),
    skipLighthouse: argv.includes('--skip-lighthouse'),
    skipLinks: argv.includes('--skip-links'),
    // Visual-regression baselines are pinned to the committed UI, so running
    // against production would always diff unless prod exactly matches HEAD.
    // Auto-skip on --prod; honor --skip-visual for local opt-out.
    skipVisual: argv.includes('--skip-visual') || isProd,
    isProd,
  };
}

function runStep(name: string, command: string, args: string[], env?: NodeJS.ProcessEnv): Promise<StepResult> {
  return new Promise((resolve) => {
    console.log(chalk.cyan(`\n▶ ${name}`));
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, ...env },
    });
    child.on('close', (code) => {
      resolve({ name, passed: code === 0, detail: code === 0 ? 'ok' : `exit ${code}` });
    });
    child.on('error', (err) => {
      resolve({ name, passed: false, detail: err.message });
    });
  });
}

async function runLighthouse(baseUrl: string): Promise<StepResult> {
  console.log(chalk.cyan(`\n▶ Lighthouse (${PAGES.length} pages)`));

  const failures: string[] = [];
  const tmpDir = mkdtempSync(join(tmpdir(), 'investax-lh-'));

  try {
    for (const path of PAGES) {
      const url = `${baseUrl}${path}`;
      const outFile = join(tmpDir, `lh-${path.replace(/\//g, '_') || 'root'}.json`);

      process.stdout.write(`  ${path} ... `);
      const result = spawnSync(
        'npx',
        [
          'lighthouse',
          url,
          '--output=json',
          `--output-path=${outFile}`,
          '--quiet',
          '--only-categories=performance,accessibility,best-practices,seo',
          '--chrome-flags=--headless=new --no-sandbox',
          '--form-factor=mobile',
        ],
        { shell: process.platform === 'win32', stdio: 'pipe', encoding: 'utf8' },
      );

      if (result.status !== 0) {
        console.log(chalk.red('FAIL (lighthouse error)'));
        failures.push(`${path}: lighthouse exited ${result.status}\n${result.stderr?.slice(0, 500) ?? ''}`);
        continue;
      }

      const report = JSON.parse(readFileSync(outFile, 'utf8'));
      const categories = report.categories as Record<string, { score: number | null; title: string }>;

      const pageFailures: string[] = [];
      for (const [key, threshold] of Object.entries(LH_THRESHOLDS)) {
        const score = Math.round((categories[key]?.score ?? 0) * 100);
        if (score < threshold) {
          pageFailures.push(`${key}=${score} (need ≥${threshold})`);
        }
      }

      if (pageFailures.length === 0) {
        console.log(chalk.green('OK'));
      } else {
        console.log(chalk.red(`FAIL: ${pageFailures.join(', ')}`));
        failures.push(`${path}: ${pageFailures.join(', ')}`);
      }
    }
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }

  return {
    name: 'Lighthouse',
    passed: failures.length === 0,
    detail: failures.length === 0 ? `${PAGES.length} pages passed` : failures.join('\n    '),
  };
}

async function runLinkChecker(baseUrl: string): Promise<StepResult> {
  console.log(chalk.cyan('\n▶ Broken-link crawler'));

  // broken-link-checker is a CJS package with no types. The named exports
  // live on the module's `.default` (as of v0.7.8) — destructuring from the
  // top of the import returns undefined and crashes with
  // "TypeError: SiteChecker is not a constructor". Reach through .default.
  const blcModule = (await import('broken-link-checker')) as unknown as {
    default: {
      SiteChecker: new (opts: unknown, handlers: unknown) => { enqueue: (url: string) => void };
    };
  };
  const { SiteChecker } = blcModule.default;

  const broken: string[] = [];
  const baseOrigin = new URL(baseUrl).origin;

  return new Promise<StepResult>((resolve) => {
    const checker = new SiteChecker(
      {
        excludeExternalLinks: true,
        excludedKeywords: ['mailto:', 'tel:'],
        maxSocketsPerHost: 4,
        // Depth is governed by filterLevel + our own origin filter below.
        filterLevel: 1,
      },
      {
        link: (result: {
          broken: boolean;
          url: { resolved: string };
          base: { resolved: string };
          brokenReason?: string;
        }) => {
          if (!result.broken) return;
          // Skip anything that somehow leaked out to an external origin.
          try {
            if (new URL(result.url.resolved).origin !== baseOrigin) return;
          } catch {
            // ignore malformed URLs
          }
          broken.push(`${result.url.resolved} (from ${result.base.resolved}): ${result.brokenReason ?? 'unknown'}`);
        },
        end: () => {
          if (broken.length === 0) {
            console.log(chalk.green('  OK (no broken internal links)'));
            resolve({ name: 'Broken-link crawler', passed: true, detail: 'no broken internal links' });
          } else {
            for (const b of broken) console.log(chalk.red(`  ${b}`));
            resolve({ name: 'Broken-link crawler', passed: false, detail: broken.join('\n    ') });
          }
        },
      },
    );

    checker.enqueue(baseUrl);
  });
}

function printSummary(results: StepResult[]): void {
  console.log(chalk.bold('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(chalk.bold('  Verification Summary'));
  console.log(chalk.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  for (const r of results) {
    const badge = r.passed ? chalk.green('✓ PASS') : chalk.red('✗ FAIL');
    console.log(`  ${badge}  ${r.name}${r.detail ? chalk.dim(` — ${r.detail.split('\n')[0]}`) : ''}`);
  }
  console.log(chalk.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const results: StepResult[] = [];

  console.log(chalk.bold(`\nInvesTax verify — BASE_URL=${args.baseUrl}`));

  if (!args.skipUnit) {
    results.push(await runStep('Unit tests', 'npm', ['test']));
  } else {
    console.log(chalk.dim('\n(skipped) Unit tests'));
  }

  if (!args.skipE2e) {
    results.push(
      await runStep('Playwright E2E', 'npx', ['playwright', 'test'], { BASE_URL: args.baseUrl }),
    );
  } else {
    console.log(chalk.dim('\n(skipped) Playwright E2E'));
  }

  if (!args.skipLighthouse) {
    results.push(await runLighthouse(args.baseUrl));
  } else {
    console.log(chalk.dim('\n(skipped) Lighthouse'));
  }

  if (!args.skipLinks) {
    results.push(await runLinkChecker(args.baseUrl));
  } else {
    console.log(chalk.dim('\n(skipped) Broken-link crawler'));
  }

  if (!args.skipVisual) {
    results.push(
      await runStep('Visual regression (Docker)', 'npm', ['run', 'verify:visual']),
    );
  } else {
    console.log(
      chalk.dim(`\n(skipped) Visual regression${args.isProd ? ' — auto-skip in --prod mode' : ''}`),
    );
  }

  printSummary(results);

  const failed = results.filter((r) => !r.passed);
  if (failed.length > 0) {
    console.log(chalk.red(`\n${failed.length} step(s) failed.\n`));
    process.exit(1);
  }
  console.log(chalk.green('\nAll verification steps passed.\n'));
  process.exit(0);
}

main().catch((err) => {
  console.error(chalk.red('\nverify.ts crashed:'), err);
  process.exit(2);
});
