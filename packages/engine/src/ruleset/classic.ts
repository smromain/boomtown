import { DEFAULT_MERGE_NAMING } from '../naming/index.js';
import type { Ruleset } from './types.js';

/**
 * The classic edition (1964 / 1999). The default. Its board geometry is
 * unambiguous where the 2015 rulebook never states a grid.
 */
export const classic: Ruleset = {
  id: 'classic',
  board: { cols: 12, rows: 9 },
  safeSize: 11,
  endChainSize: 41,
  bonusTiers: 2,
  bandCuts: [2, 3, 4, 5, 10, 20, 30, 40],
  soleHolderPolicy: 'both',
  deadTilePolicy: 'none',
  phantomShareholderInTwoPlayer: false,
  splitRounding: 'none',
  mergeNaming: DEFAULT_MERGE_NAMING,
};
