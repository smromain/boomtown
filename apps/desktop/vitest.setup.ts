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

/**
 * Nothing may render a copy placeholder to a player.
 *
 * `src/copy/usage.test.ts` proves statically that every `{placeholder}` string
 * goes through `fill` with the right keys. This is the other half, and it costs
 * one regex per test: whatever any test happened to render, look at the text it
 * produced and fail if a brace pair survived into it. Between the two, a
 * literal `{name}` cannot reach a screen a test has ever visited — including
 * the screens whose own assertions are negative ("this prompt is absent"),
 * which would otherwise pass while showing nonsense.
 *
 * Deliberately narrow: `{word}` and nothing else, so a stray brace in prose or
 * in rendered code samples doesn't cry wolf.
 */
const PLACEHOLDER = /\{[a-z][a-zA-Z]*\}/;

afterEach(() => {
  const text = document.body.textContent ?? '';
  const leaked = PLACEHOLDER.exec(text);
  // Unmount first: a failed expectation must not leave the tree behind for the
  // next test to inherit.
  cleanup();
  if (leaked) {
    throw new Error(
      `An unfilled copy placeholder reached the screen: ${leaked[0]}\n` +
        'Something rendered a string from constants.json without fill(), or ' +
        'filled it with the wrong keys.',
    );
  }
});
