/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { vitePrerenderPlugin } from 'vite-prerender-plugin';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    vitePrerenderPlugin({
      renderTarget: '#root',
      prerenderScript: path.resolve(__dirname, 'src/prerender.tsx'),
      additionalPrerenderRoutes: [
        '/pricing',
        '/calculator',
        '/privacy',
        '/terms',
        '/contact',
        '/ghid',
        '/ghid/declaratie-unica-trading212',
        '/ghid/declaratie-unica-revolut',
        '/ghid/declaratie-unica-ibkr',
        '/ghid/cass-investitii',
        '/ghid/dividende-broker-strain',
        '/ghid/cum-completez-declaratia-unica',
        '/ghid/cum-calculam',
        '/ghid/notificare-anaf-venituri-strainatate',
        '/ghid/impozit-xtb',
        '/embed',
        '/embed/calculator',
      ],
    }),
  ],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    // Cap the worker pool. Vitest sizes its fork pool to the CPU thread count
    // by default; on a high-core dev machine that spawns 20+ Node processes,
    // each re-loading the full module graph (React + happy-dom + pdfjs-dist +
    // jspdf here, the heaviest of the three workspaces), which saturates RAM.
    // CI runners are 4 vCPU so this is a no-op there. See
    // shared/vitest.config.ts for the full rationale.
    pool: 'forks',
    poolOptions: { forks: { maxForks: 4, minForks: 1 } },
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/__tests__/**',
        'src/test/**',
        'src/main.tsx',
        'src/prerender.tsx',
        'src/**/*.d.ts',
      ],
    },
  },
});
