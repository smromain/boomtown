import { activeCorporations, corpSize, isSafe, type GameState } from '../state.js';

/**
 * Whether a seat may announce the end this turn (`docs/rules.md`): one
 * corporation has reached the end size, or every corporation on the board is
 * safe. Announcing is always optional.
 */
export function endConditionMet(state: GameState): boolean {
  const active = activeCorporations(state);
  if (active.length === 0) return false;
  if (active.some((industry) => corpSize(state, industry) >= state.ruleset.endChainSize)) {
    return true;
  }
  return active.every((industry) => isSafe(state, industry));
}
