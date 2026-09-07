import type { TileId } from '../board.js';
import { RULES } from '../constants.js';
import type { EngineEvent } from '../events.js';
import { activeSeat, type GameState } from '../state.js';
import { classifyPlacement } from './placement.js';

/** Draw the active seat back up to a full hand from the bag. */
export function drawToFull(state: GameState, events: EngineEvent[]): void {
  const seat = activeSeat(state);
  const hand = state.hands[seat]!;
  let drawn = 0;
  while (hand.length < RULES.handSize && state.bag.length > 0) {
    hand.push(state.bag.shift()!);
    drawn++;
  }
  if (drawn > 0) events.push({ type: 'tiles-drawn', seat, count: drawn });
}

/**
 * Dead-tile sweep: a permanently unplayable tile — one that would illegally
 * merge two safe corporations — is revealed, set face-up out of play, and
 * replaced from the bag. A replacement that is itself dead is swept immediately
 * (loop until stable). Both editions do this (`deadTilePolicy`).
 */
export function sweepDeadTiles(state: GameState, events: EngineEvent[]): void {
  if (state.ruleset.deadTilePolicy !== 'discardAndReplace') return;
  const seat = activeSeat(state);
  const hand = state.hands[seat]!;
  const swept: TileId[] = [];

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = hand.length - 1; i >= 0; i--) {
      const tile = hand[i]!;
      if (classifyPlacement(state, tile).kind !== 'dead') continue;
      hand.splice(i, 1);
      swept.push(tile);
      if (state.bag.length > 0) hand.push(state.bag.shift()!);
      changed = true;
    }
  }

  if (swept.length > 0) {
    state.removed.push(...swept);
    events.push({ type: 'dead-tiles-swept', seat, tiles: swept });
  }
}

/** Advance to the next seat and reset the turn to the placement step. */
export function advanceTurn(state: GameState, events: EngineEvent[]): void {
  state.turnPointer = (state.turnPointer + 1) % state.turnOrder.length;
  state.step = 'place';
  state.pendingFound = null;
  events.push({ type: 'turn-advanced', seat: activeSeat(state) });
}
