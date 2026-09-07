import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * A separate project for the PartyKit room integration test. It boots a real
 * `partykit dev` server (workerd) once via globalSetup and drives it over
 * WebSockets. Kept out of the default `npm test` run because it needs the
 * `workerd` binary and one outbound call to Cloudflare on boot; run it with
 * `npm run test:server`.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@boomtown/engine': r('../engine/src/index.ts'),
      '@boomtown/protocol': r('../protocol/src/index.ts'),
      '@boomtown/ai': r('../ai/src/index.ts'),
      '@boomtown/client-core': r('../client-core/src/index.ts'),
      '@boomtown/server': r('./src/index.ts'),
    },
  },
  root: r('.'),
  test: {
    name: 'server-integration',
    environment: 'node',
    include: ['test/**/*.integration.test.ts'],
    globalSetup: [r('./test/partykit-server.ts')],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
