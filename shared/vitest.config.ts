import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
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
    },
  },
});
