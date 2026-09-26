import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * The couch-mode phone page (#62). It is built into the room's own package and
 * served by PartyKit beside the room (`serve` in `packages/server/partykit.json`),
 * at `/phone/` — one deploy ships both, so the page and the room can never
 * disagree about the protocol.
 *
 * `@desktop` reaches the desktop app's *pure* modules — the copy file, and the
 * buy, disposal, vote and founding arithmetic — so the phone says what the
 * table says and adds up the way the table adds up. No desktop component comes
 * across: the phone draws its own, for thumbs.
 */
export const aliases = {
  '@boomtown/engine': r('../../packages/engine/src/index.ts'),
  '@boomtown/protocol': r('../../packages/protocol/src/index.ts'),
  '@boomtown/client-core': r('../../packages/client-core/src/index.ts'),
  '@desktop': r('../desktop/src'),
};

export default defineConfig({
  base: '/phone/',
  plugins: [react()],
  resolve: { alias: aliases },
  server: {
    port: Number(process.env['BOOMTOWN_PHONE_PORT'] ?? 5174),
    strictPort: true,
    fs: { allow: [r('../..')] },
  },
  build: {
    outDir: r('../../packages/server/public/phone'),
    emptyOutDir: true,
  },
});
