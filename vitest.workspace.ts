import { defineWorkspace } from 'vitest/config';

/** Three test projects: the Node engine/packages suite, and the jsdom desktop and phone suites. */
export default defineWorkspace(['./vitest.config.ts', './apps/desktop/vitest.config.ts', './apps/phone/vitest.config.ts']);
