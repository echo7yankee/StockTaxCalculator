import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // Match the app workspaces: cap the fork pool so a tiny suite does not
    // spawn one Node process per CPU thread on a high-core dev machine.
    pool: 'forks',
    poolOptions: { forks: { maxForks: 4, minForks: 1 } },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/__tests__/**', 'src/**/*.d.ts'],
    },
  },
});
