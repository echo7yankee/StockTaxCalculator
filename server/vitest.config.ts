import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // Cap the worker pool. Vitest sizes its fork pool to the CPU thread count
    // by default; on a high-core dev machine that spawns 20+ Node processes for
    // a tiny suite and saturates RAM. CI runners are 4 vCPU so this is a no-op
    // there. See shared/vitest.config.ts for the full rationale.
    pool: 'forks',
    poolOptions: { forks: { maxForks: 4, minForks: 1 } },
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
