import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { buildStamp } from './buildStamp.js';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  // The same constants the app is built with, so the settings pane's build line
  // is exercised by its test rather than falling back to a stub.
  define: buildStamp(import.meta.url),
  resolve: {
    alias: {
      '@boomtown/engine': r('../../packages/engine/src/index.ts'),
      '@boomtown/protocol': r('../../packages/protocol/src/index.ts'),
      '@boomtown/ai': r('../../packages/ai/src/index.ts'),
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
