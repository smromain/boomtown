import {
  makeRng,
  nextFloat,
  nextInt,
  type Command,
  type GameState,
  type Rng,
  type Seat,
} from '@boomtown/engine';
import { difficulty, type DifficultyKnobs } from './difficulty.js';
import { backsMotion } from './vote.js';
import { bestScore, ownMoves, scoreMove } from './heuristic.js';

/**
 * A bot's decision procedure (KTD7). One call chooses the seat's next command —
 * a placement, a founding, a buy, an end-check answer, or a merger decision —
 * whatever `legalMoves` currently offers that seat.
 *
 * It is a pure function of the state and an immutable `Rng`: the same seed and
 * state always produce the same move (R7). The caller owns the `Rng` and threads
 * the returned one into the next call, exactly as the engine threads its own.
 * `null` means the seat has no legal move — the caller should not have asked.
 *
 * A search-based policy (MCTS/POMCP, deferred) can replace this behind the same
 * interface.
 */
export interface Policy {
  chooseMove(state: GameState, seat: Seat, rng: Rng): { command: Command; rng: Rng } | null;
}

export interface HeuristicPolicyOptions {
  /** 1–10 (KTD7). Maps to lookahead plies and a blunder rate. */
  readonly level: number;
}

/**
 * The day-one policy: greedy one-ply evaluation with an optional shallow
 * self-lookahead, plus a difficulty-scaled blunder rate. It enumerates the
 * seat's legal moves, scores each by applying it and reading `evaluate` on the
 * result, and takes the best — except with probability `blunderRate`, when it
 * takes a uniformly random legal move instead. That single lever is what makes
 * a low difficulty feel like a weak player rather than a broken one.
 */
export function heuristicPolicy({ level }: HeuristicPolicyOptions): Policy {
  const knobs: DifficultyKnobs = difficulty(level);

  return {
    chooseMove(state, seat, rng) {
      const moves = ownMoves(state, seat);
      if (moves.length === 0) return null;
      if (moves.length === 1) return { command: moves[0]!, rng };

      const blunder = nextFloat(rng);
      if (blunder.value < knobs.blunderRate) {
        const pick = nextInt(blunder.rng, moves.length);
        return { command: moves[pick.value]!, rng: pick.rng };
      }

      // Votes are decided on standing, not on score. `evaluate` measures a
      // seat's own money, and settling raises everybody's — so scoring a vote
      // the generic way makes every bot vote yes and every motion carry
      // regardless of the quota. See `vote.ts`.
      const vote = moves.find((move) => move.type === 'cast-vote');
      if (vote) {
        return {
          command: { ...vote, inFavour: backsMotion(state, seat, knobs.backingMargin) },
          rng: blunder.rng,
        };
      }

      const motion = moves.find((move) => move.type === 'move-to-liquidate');
      if (motion && backsMotion(state, seat, knobs.backingMargin)) {
        return { command: motion, rng: blunder.rng };
      }

      return {
        command: pickBest(
          state,
          seat,
          // Never raise a motion for scoring reasons: it is handled above, and
          // `evaluate` would take it for the wrong reason every time.
          moves.filter((move) => move.type !== 'move-to-liquidate'),
          knobs,
        ),
        rng: blunder.rng,
      };
    },
  };
}

/**
 * Ties are broken by the move's own index, so the choice is deterministic for a
 * fixed state without consuming the `Rng` — the blunder roll is the only place
 * randomness enters, which keeps a seeded bot game exactly replayable.
 */
function pickBest(
  state: GameState,
  seat: Seat,
  moves: readonly Command[],
  knobs: DifficultyKnobs,
): Command {
  let best = moves[0]!;
  let bestScoreValue = Number.NEGATIVE_INFINITY;
  for (const move of moves) {
    const score = scoreMove(state, seat, move, knobs.lookahead);
    if (score > bestScoreValue) {
      bestScoreValue = score;
      best = move;
    }
  }
  return best;
}

/** A convenience `Rng` factory for callers that just need a bot seed. */
export function botRng(seed: number): Rng {
  return makeRng(seed);
}

export { bestScore };
