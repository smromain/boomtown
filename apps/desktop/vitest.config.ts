import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@boomtown/engine': r('../../packages/engine/src/index.ts'),
      '@boomtown/protocol': r('../../packages/protocol/src/index.ts'),
      '@boomtown/client-core': r('../../packages/client-core/src/index.ts'),
    },
  },
  test: {
    name: 'desktop',
    environment: 'jsdom',
    setupFiles: [r('./vitest.setup.ts')],
    include: ['electron/**/*.test.ts', 'src/**/*.test.{ts,tsx}'],
    passWithNoTests: true,
  },
});
