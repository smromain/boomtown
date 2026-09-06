import type { Ruleset } from './types.js';

/**
 * The 2015 Avalon Hill edition. The rulebook lists 100 tiles and never states
 * the grid; `docs/decisions.md` keeps this an open question, so the board here
 * mirrors classic geometry until a real 2015 layout is needed.
 */
export const edition2015: Ruleset = {
  id: 'edition-2015',
  board: { cols: 12, rows: 9 },
  safeSize: 10,
  endChainSize: 38,
  bonusTiers: 3,
  bandCuts: [2, 3, 4, 5, 7, 17, 27, 37],
  soleHolderPolicy: 'primaryAndTertiary',
  deadTilePolicy: 'discardAndReplace',
  phantomShareholderInTwoPlayer: true,
  splitRounding: 'up100',
};
