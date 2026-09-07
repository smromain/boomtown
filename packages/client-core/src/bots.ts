import { makeRng, type GameState, type Rng, type Seat } from '@boomtown/engine';
import { heuristicPolicy, type Policy } from '@boomtown/ai';
import type { GameClient } from './dispatch.js';

/** One bot seat: which seat, and how it decides. */
export interface BotSeat {
  readonly seat: Seat;
  readonly policy: Policy;
}

export interface BotDriverOptions {
  /** Bot seats and their difficulty (1–10). Human seats are simply absent. */
  readonly bots: readonly { readonly seat: Seat; readonly level: number }[];
  /**
   * Reads the authoritative state a policy needs. In hot-seat this is
   * `session.snapshot()`; the server (U16) will pass its own room state. Kept as
   * a getter so the driver never holds a stale reference.
   */
  readonly snapshot: () => GameState;
  /**
   * Seeds the bots' blunder rolls. A fixed value makes a bot game exactly
   * replayable (R7); omit it and a fresh seed is drawn per game.
   */
  readonly seed?: number;
  /**
   * Delay before a bot move lands, in ms. A small pause keeps an all-bot game
   * watchable and matches how a human turn feels; 0 in tests.
   */
  readonly thinkMs?: number;
}

/**
 * Drives the bot seats of a local game. It subscribes to the client store and,
 * whenever the seat that owes a command is a bot, asks that bot's policy and
 * dispatches — including every merger decision, so a bot never stalls the
 * machine. Humans are untouched: their seats are not in `bots`.
 *
 * This is the only place bot turns are produced for local play. The server
 * reuses `heuristicPolicy` directly for online games (KTD7).
 */
export function attachBotDriver(client: GameClient, options: BotDriverOptions): () => void {
  const policies = new Map<Seat, Policy>(
    options.bots.map(({ seat, level }) => [seat, heuristicPolicy({ level })]),
  );
  const thinkMs = options.thinkMs ?? 600;
  let rng: Rng = makeRng(options.seed ?? (Date.now() & 0x7fffffff));
  let pending: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const cancel = () => {
    if (pending !== null) {
      clearTimeout(pending);
      pending = null;
    }
  };

  /** The seat that owes the next command, if it is a bot we drive. */
  const botToMove = (): Seat | null => {
    const state = client.store.getState();
    if (state.status !== 'ready') return null;
    if (state.inFlight !== null) return null; // wait for the echo to reconcile
    const seat = state.pendingDecision?.seat ?? state.activeSeat;
    if (seat === null || !policies.has(seat)) return null;
    return seat;
  };

  const step = () => {
    cancel();
    if (stopped) return;
    const seat = botToMove();
    if (seat === null) return;

    pending = setTimeout(() => {
      pending = null;
      if (stopped) return;
      // Re-check: a human may have acted, or the turn moved on, during the pause.
      if (botToMove() !== seat) {
        step();
        return;
      }
      const choice = policies.get(seat)!.chooseMove(options.snapshot(), seat, rng);
      if (choice === null) return;
      rng = choice.rng;
      client.dispatch(choice.command);
    }, thinkMs);
  };

  const unsubscribe = client.store.subscribe(step);
  step(); // in case a bot is already on the clock at attach time

  return () => {
    stopped = true;
    cancel();
    unsubscribe();
  };
}
