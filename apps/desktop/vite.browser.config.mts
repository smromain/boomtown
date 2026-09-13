import { defineConfig } from 'vite';
import electron from './electron.vite.config.js';

/**
 * The renderer, served to an ordinary browser.
 *
 * Nothing in the game surface needs the Electron shell — only `debug/dump.ts`
 * touches `window.boomtown`, and it checks for it first — so the whole app can
 * be driven in a plain page. That is what makes an automated playthrough
 * possible: a browser is scriptable in a way the packaged shell isn't.
 *
 * It reuses `electron.vite.config.ts`'s own renderer options rather than
 * restating them, so the workspace aliases can't drift between the two ways of
 * running the same code.
 */
export default defineConfig({
  ...electron.renderer,
  server: { port: Number(process.env['BOOMTOWN_WEB_PORT'] ?? 5173), strictPort: true },
});
