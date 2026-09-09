import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';

// React 19 expects this flag before rendering.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom does not implement matchMedia; every beat and reduced-motion test
// needs it (U10/U12). `matches` defaults to false — a test overrides it per
// case by re-stubbing `window.matchMedia`.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(), // deprecated, still called by some libraries
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// Radix runs effects (focus traps) on ticks that RTL's act wrapper cannot see.
// The renders themselves are covered; silence only this one non-actionable
// warning so real failures stay visible.
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
