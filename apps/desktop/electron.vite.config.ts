import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * electron-vite builds three targets. Main runs as ESM (Electron 44). The
 * preload is forced to CommonJS because a sandboxed preload (KTD9) cannot be an
 * ES module. The renderer is a normal Vite + React build; workspace packages
 * resolve to source so there is one rules code path.
 */
export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      lib: { entry: r('./electron/main.ts') },
      rollupOptions: { output: { entryFileNames: 'main.mjs' } },
    },
  },
  preload: {
    build: {
      outDir: 'out/preload',
      lib: { entry: r('./electron/preload.ts'), formats: ['cjs'] },
      rollupOptions: { output: { entryFileNames: 'preload.cjs' } },
    },
  },
  renderer: {
    root: '.',
    plugins: [react()],
    resolve: {
      alias: {
        '@boomtown/engine': r('../../packages/engine/src/index.ts'),
        '@boomtown/protocol': r('../../packages/protocol/src/index.ts'),
        '@boomtown/ai': r('../../packages/ai/src/index.ts'),
        '@boomtown/client-core': r('../../packages/client-core/src/index.ts'),
      },
    },
    build: {
      outDir: 'out/renderer',
      rollupOptions: { input: r('./index.html') },
    },
    // BOOMTOWN_DEV_PORT lets a second `npm run dev` bind its own renderer port
    // so two instances can join the same online room (see the README). Unset in
    // CI and normal use — the default 5173 is unchanged.
    ...(process.env['BOOMTOWN_DEV_PORT']
      ? { server: { port: Number(process.env['BOOMTOWN_DEV_PORT']), strictPort: true } }
      : {}),
  },
});
