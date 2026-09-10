import type { BuyShares, Command } from '../commands.js';
import { RULES } from '../constants.js';
import { INDUSTRIES, type Industry } from '../pool.js';
import { activeCorporations, activeSeat, sharePriceOf, type GameState, type Seat } from '../state.js';
import { isPlayable } from '../reducer/placement.js';
import { endConditionMet } from '../reducer/endgame.js';
import { canMoveToLiquidate } from '../reducer/motion.js';

/**
 * Every command the reducer would accept for the current state (R8). Each
 * command names the seat it belongs to, so a caller can filter by seat. The set
 * never drifts from `reduce` — a returned command always applies cleanly.
 */
export function legalMoves(state: GameState): Command[] {
  if (state.status === 'over') return [];

  const merger = state.merger;
  if (state.step === 'merge' && merger?.pending) {
    return mergerMoves(state);
  }

  // A motion owns the clock while it is open, the same way a merger does.
  const motion = state.motion;
  if (state.step === 'vote' && motion?.pending) {
    const seat = motion.pending.seat;
    return [
      { type: 'cast-vote', seat, inFavour: true },
      { type: 'cast-vote', seat, inFavour: false },
    ];
  }

  const seat = activeSeat(state);

  switch (state.step) {
    case 'place':
      return placeMoves(state, seat);
    case 'found':
      return foundMoves(state, seat);
    case 'buy':
      return buyMoves(state, seat);
    case 'end-check':
      return [
        ...(endConditionMet(state) ? [{ type: 'announce-end', seat } as Command] : []),
        ...(canMoveToLiquidate(state, seat) ? [{ type: 'move-to-liquidate', seat } as Command] : []),
        { type: 'end-turn', seat },
      ];
    case 'merge':
      return []; // a merge with no pending decision is a transient internal state
    case 'vote':
      return []; // a vote with no pending decision is likewise transient
  }
}

/** Convenience: only the moves that belong to `seat`. */
export function legalMovesForSeat(state: GameState, seat: Seat): Command[] {
  return legalMoves(state).filter((command) => 'seat' in command && command.seat === seat);
}

function placeMoves(state: GameState, seat: Seat): Command[] {
  const playable = state.hands[seat]!.filter((tile) => isPlayable(state, tile));
  if (playable.length === 0) return [{ type: 'end-turn', seat }];
  return playable.map((tile) => ({ type: 'place-tile', seat, tile }));
}

function foundMoves(state: GameState, seat: Seat): Command[] {
  const group = state.pendingFound?.group ?? [];
  const unfounded = INDUSTRIES.filter((industry) => !state.corporations[industry].founded);
  const moves: Command[] = [];
  for (const industry of unfounded) {
    for (const hqTile of group) {
      moves.push({ type: 'found-corporation', seat, industry, hqTile });
    }
  }
  return moves;
}

function buyMoves(state: GameState, seat: Seat): Command[] {
  const cash = state.seats[seat]!.cash;
  const active = activeCorporations(state).filter((i) => sharePriceOf(state, i) !== null);
  const moves: BuyShares[] = [{ type: 'buy-shares', seat, picks: {} }];

  const recurse = (index: number, remaining: number, picks: Partial<Record<Industry, number>>, cost: number) => {
    if (index >= active.length || remaining === 0) return;
    const industry = active[index]!;
    const price = sharePriceOf(state, industry)!;
    const maxHere = Math.min(remaining, state.bankShares[industry], Math.floor((cash - cost) / price));
    for (let qty = 1; qty <= maxHere; qty++) {
      const nextPicks = { ...picks, [industry]: qty };
      moves.push({ type: 'buy-shares', seat, picks: nextPicks });
      recurse(index + 1, remaining - qty, nextPicks, cost + qty * price);
    }
    recurse(index + 1, remaining, picks, cost);
  };

  recurse(0, RULES.maxStockPurchasesPerTurn, {}, 0);
  return moves;
}

function mergerMoves(state: GameState): Command[] {
  const pending = state.merger!.pending!;
  const survivor = state.merger!.survivor;

  switch (pending.type) {
    case 'cast-vote':
      // Not reachable: a vote is answered through the motion branch above, and
      // this function is only called with a merger pending.
      return [];
    case 'choose-survivor':
      return pending.options.map((survivorChoice) => ({
        type: 'choose-survivor',
        seat: pending.seat,
        survivor: survivorChoice,
      }));
    case 'choose-defunct-order':
      return pending.options.map((next) => ({
        type: 'choose-defunct-order',
        seat: pending.seat,
        next,
      }));
    case 'dispose-shares': {
      const moves: Command[] = [];
      const bank = survivor ? state.bankShares[survivor] : 0;
      const maxTrade = Math.min(pending.shares, bank * 2);
      for (let trade = 0; trade <= maxTrade; trade += 2) {
        for (let sell = 0; sell <= pending.shares - trade; sell++) {
          moves.push({
            type: 'dispose-shares',
            seat: pending.seat,
            hold: pending.shares - trade - sell,
            sell,
            trade,
          });
        }
      }
      return moves;
    }
  }
}
