import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // Cap the worker pool. Vitest sizes its fork pool to the CPU thread count
    // by default; on a high-core dev machine (e.g. a 24-thread box) that spawns
    // 20+ Node processes for a ~15-file suite, each re-loading the full module
    // graph (engine + fast-check here), which saturates RAM. GitHub CI runners
    // are 4 vCPU so maxForks:4 is a no-op there and a big win locally. Raise it
    // only if the suite grows substantially. See playwright.config.ts for the
    // E2E (browser) equivalent.
    pool: 'forks',
    poolOptions: { forks: { maxForks: 4, minForks: 1 } },
    // Pick up the shared workspace's own tests AND the test-data scripts'
    // tests. test-data lives outside any workspace (no package.json of its
    // own) but its scripts are part of the test infrastructure, so we run
    // their unit tests alongside the shared engine + parser suites.
    include: [
      'src/**/*.{test,spec}.?(c|m)[jt]s?(x)',
      '../test-data/**/*.{test,spec}.?(c|m)[jt]s?(x)',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/__tests__/**',
        'src/index.ts',
        'src/types/**',
        'src/**/*.d.ts',
      ],
      // Regression Firewall (09-backlog-and-discipline.md Section 8.6 #4):
      // a CI coverage floor on the moat. The engine + parsers are where a
      // wrong number can reach a user, so a new broker or engine change MUST
      // ship with tests, not just a happy path. CI runs `npm run test:coverage`
      // in the verify job, so dropping below a floor fails the build.
      //
      // These are ratchet floors set just under the values measured in
      // session #92 (2026-05-29): engine 97.15/87.23/100/97.15 and parsers
      // 95.32/76.74/100/95.32 (stmts/branch/funcs/lines). Raise them as
      // coverage improves; never lower one to make a PR pass. Scoped to the
      // two moat dirs only (no global threshold) so unrelated low-coverage
      // files never block a moat PR.
      thresholds: {
        'src/engine/**': {
          statements: 96,
          branches: 85,
          functions: 100,
          lines: 96,
        },
        'src/parsers/**': {
          statements: 94,
          branches: 75,
          functions: 100,
          lines: 94,
        },
      },
    },
  },
});
