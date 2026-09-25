import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { aliases } from './vite.config.js';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: aliases },
  test: {
    name: 'phone',
    environment: 'jsdom',
    setupFiles: [r('./vitest.setup.ts')],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
