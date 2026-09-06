import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';

// React 19 / R3F test-renderer expect this flag before rendering.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Radix and R3F run effects (focus traps, animation loops) on ticks that RTL's
// act wrapper cannot see. The renders themselves are covered; silence only this
// one non-actionable warning so real failures stay visible.
const realError = console.error;
beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('not configured to support act')) return;
    realError(...args);
  });
});
afterAll(() => {
  vi.mocked(console.error).mockRestore();
});

// Unmount React trees between tests so component state never leaks.
afterEach(() => {
  cleanup();
});
