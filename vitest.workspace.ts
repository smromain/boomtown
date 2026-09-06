import { defineWorkspace } from 'vitest/config';

/** Two test projects: the Node engine/packages suite, and the jsdom desktop suite. */
export default defineWorkspace(['./vitest.config.ts', './apps/desktop/vitest.config.ts']);
