import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@boomtown/engine': r('./packages/engine/src/index.ts'),
      '@boomtown/protocol': r('./packages/protocol/src/index.ts'),
      '@boomtown/ai': r('./packages/ai/src/index.ts'),
      '@boomtown/client-core': r('./packages/client-core/src/index.ts'),
      '@boomtown/server': r('./packages/server/src/index.ts'),
    },
  },
  test: {
    name: 'engine',
    include: ['packages/*/test/**/*.test.ts'],
    // Integration tests boot a real partykit dev server (workerd) — run them
    // via `npm run test:server`, not in the fast default suite.
    exclude: ['**/node_modules/**', '**/*.integration.test.ts'],
    environment: 'node',
    passWithNoTests: true,
  },
});
