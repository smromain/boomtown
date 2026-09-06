// @ts-check
import tseslint from 'typescript-eslint';

/** Determinism guard: nothing under the engine or the bots may read wall-clock
 *  time or unseeded randomness. A single violation breaks replay (R7),
 *  reconnection, and bot reproducibility at once. */
const determinismRules = {
  'no-restricted-globals': [
    'error',
    { name: 'Date', message: 'Deterministic packages must not read wall-clock time (R7). Use values passed in state.' },
  ],
  'no-restricted-properties': [
    'error',
    { object: 'Math', property: 'random', message: 'Use the seeded PRNG carried in game state (R7).' },
    { object: 'Date', property: 'now', message: 'Deterministic packages must not read wall-clock time (R7).' },
    { object: 'performance', property: 'now', message: 'Deterministic packages must not read wall-clock time (R7).' },
  ],
};

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/*.dc.html', 'design/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['packages/engine/src/**/*.ts', 'packages/ai/src/**/*.ts'],
    rules: determinismRules,
  },
);
