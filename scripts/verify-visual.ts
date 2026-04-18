#!/usr/bin/env tsx
/**
 * Visual-regression runner — executes the Playwright visual-regression suite
 * inside the pinned Linux Docker image so that baselines are generated and
 * compared in identical environments. Cross-platform runner (Windows, macOS,
 * Linux host).
 *
 * Usage:
 *   npm run verify:visual          → compare against committed baselines
 *   npm run verify:visual:update   → regenerate baselines (writes PNGs into
 *                                    e2e/visual-regression.spec.ts-snapshots/
 *                                    on the host via the bind-mount)
 *
 * The container spawns the dev servers via Playwright's `webServer` config
 * (same flow as the local run), so no host-side dev-server is required.
 *
 * Named volumes (`investax_visual_*`) overlay the bind-mount so the container
 * keeps its own Linux-native node_modules without touching the host's.
 * First run ≈ 3 min (npm ci + Prisma generate); subsequent runs skip install.
 *
 * Part of PR-C of the launch-verification tooling
 * (09-backlog-and-discipline.md Section 8.1 item #15).
 */

import { spawn, spawnSync } from 'node:child_process';
import chalk from 'chalk';

const IMAGE = 'mcr.microsoft.com/playwright:v1.59.0-jammy';
const VOL_PREFIX = 'investax_visual';
const update = process.argv.includes('--update');

function ensureDocker(): void {
  const res = spawnSync('docker', ['--version'], { encoding: 'utf8' });
  if (res.status !== 0 || !res.stdout?.includes('Docker')) {
    console.error(
      chalk.red(
        'docker is not available on PATH. Install Docker Desktop (Windows/Mac) or Docker Engine (Linux) and retry.',
      ),
    );
    process.exit(1);
  }
}

function main(): void {
  ensureDocker();

  const cwd = process.cwd();

  // Container steps:
  //   1. Install deps only if the node_modules volume is empty (first run)
  //   2. Generate Prisma client (cheap; covers client-regeneration across runs)
  //   3. Run the visual-regression spec, with or without --update-snapshots
  const playwrightCmd = `npx playwright test e2e/visual-regression.spec.ts${
    update ? ' --update-snapshots' : ''
  }`;
  const containerScript = [
    '[ -d node_modules ] && [ -d client/node_modules ] && [ -d server/node_modules ] && [ -d shared/node_modules ]' +
      ' || npm ci --prefer-offline --no-audit --progress=false',
    'npx --workspace server prisma generate',
    playwrightCmd,
  ].join(' && ');

  const dockerArgs = [
    'run',
    '--rm',
    '--ipc=host',
    '--shm-size=2g',
    '-v', `${cwd}:/work`,
    '-v', `${VOL_PREFIX}_root_nm:/work/node_modules`,
    '-v', `${VOL_PREFIX}_client_nm:/work/client/node_modules`,
    '-v', `${VOL_PREFIX}_server_nm:/work/server/node_modules`,
    '-v', `${VOL_PREFIX}_shared_nm:/work/shared/node_modules`,
    '-w', '/work',
    '-e', 'CI=1',
    IMAGE,
    'bash',
    '-lc',
    containerScript,
  ];

  console.log(chalk.cyan(`▶ Running visual regression in ${IMAGE}`));
  if (update) {
    console.log(chalk.yellow('   mode: --update-snapshots (baselines will be regenerated)'));
  }

  const child = spawn('docker', dockerArgs, { stdio: 'inherit' });
  child.on('close', (code) => process.exit(code ?? 1));
  child.on('error', (err) => {
    console.error(chalk.red(`docker run failed: ${err.message}`));
    process.exit(1);
  });
}

main();
