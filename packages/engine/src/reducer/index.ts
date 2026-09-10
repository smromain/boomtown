import type { Command } from '../commands.js';
import { err } from '../errors.js';
import type { GameState } from '../state.js';
import { applyBuyShares } from './buy.js';
import { applyAnnounceEnd, applyEndTurn } from './endcheck.js';
import { applyCastVote, applyMoveToLiquidate } from './motion.js';
import { applyFoundCorporation } from './found.js';
import { applyPlaceTile } from './place.js';
import { resolveMergerCommand } from './merge/machine.js';
import type { ReduceResult } from './result.js';

/**
 * The one entry point. Validates `command` against `state` and returns events
 * plus the next state, or a typed rejection. Pure: the input state is never
 * mutated (KTD2). Given a seed, replaying the command log reproduces state
 * exactly (R7).
 */
export function reduce(state: GameState, command: Command): ReduceResult {
  if (state.status === 'over') return err('game-over', 'the game has ended');

  const draft: GameState = structuredClone(state);

  switch (command.type) {
    case 'place-tile':
      return applyPlaceTile(draft, command);
    case 'found-corporation':
      return applyFoundCorporation(draft, command);
    case 'buy-shares':
      return applyBuyShares(draft, command);
    case 'choose-survivor':
    case 'choose-defunct-order':
    case 'dispose-shares':
      return resolveMergerCommand(draft, command);
    case 'announce-end':
      return applyAnnounceEnd(draft, command);
    case 'move-to-liquidate':
      return applyMoveToLiquidate(draft, command);
    case 'cast-vote':
      return applyCastVote(draft, command);
    case 'end-turn':
      return applyEndTurn(draft, command);
  }
}

/** Fold a whole command log onto a starting state. Stops at the first rejection. */
export function replay(
  initial: GameState,
  commands: readonly Command[],
): { state: GameState; applied: number } | { error: ReturnType<typeof err>['error']; applied: number } {
  let state = initial;
  let applied = 0;
  for (const command of commands) {
    const result = reduce(state, command);
    if (!result.ok) return { error: result.error, applied };
    state = result.state;
    applied++;
  }
  return { state, applied };
}
