import { makeRng, type Command, type GameState, type Rng, type Seat } from '@boomtown/engine';
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
  /**
   * Called when a bot decision throws or the driver notices it has been owed a
   * move for far too long. Dev builds wire this to a state dump so a stuck game
   * is diagnosable after the fact. Absent in production and tests.
   */
  readonly onStuck?: (report: BotStuckReport) => void;
  /**
   * How long (ms) a bot may be owed a move before the watchdog forces a retry
   * and fires `onStuck`. Defaults to a few seconds scaled off `thinkMs`, capped
   * at 15s. Mainly a test seam.
   */
  readonly watchdogMs?: number;
}

export interface BotStuckReport {
  readonly reason: 'threw' | 'watchdog';
  readonly seat: Seat;
  readonly error?: unknown;
  /** The authoritative state at the moment the driver gave up on this attempt.
   *  Absent only when `snapshot()` itself threw. */
  readonly state?: GameState;
}

export interface BotDriver {
  /** Detach the driver and stop all timers. */
  detach: () => void;
  /** Force an immediate move attempt for whichever bot owes the next command.
   *  A manual escape hatch for the UI if a bot ever appears stuck. No-op when no
   *  bot is on the clock. */
  nudge: () => void;
}

/**
 * Drives the bot seats of a local game. It subscribes to the client store and,
 * whenever the seat that owes a command is a bot, asks that bot's policy and
 * dispatches — including every merger decision, so a bot never stalls the
 * machine. Humans are untouched: their seats are not in `bots`.
 *
 * This is the only place bot turns are produced for local play. The server
 * reuses `heuristicPolicy` directly for online games (KTD7).
 *
 * Robustness: the driver must never wedge a game. A store write does not reset
 * an already-scheduled think timer (so an unrelated write cadence can't starve
 * the bot), a throwing decision is caught and retried rather than killing the
 * subscription, and a watchdog forces a retry if a bot has been owed a move for
 * far longer than it should take.
 *
 * Returns a `BotDriver`. For backwards compatibility the return value is also
 * directly callable as the detach function.
 */
export function attachBotDriver(
  client: GameClient,
  options: BotDriverOptions,
): BotDriver & (() => void) {
  const policies = new Map<Seat, Policy>(
    options.bots.map(({ seat, level }) => [seat, heuristicPolicy({ level })]),
  );
  const thinkMs = options.thinkMs ?? 600;
  // How long a bot may be owed a move before the watchdog steps in. Deep-search
  // decisions at the top difficulty take well under a second, so a few seconds
  // is generous; kept tight so a real wedge is caught quickly rather than never.
  const watchdogMs = options.watchdogMs ?? Math.max(5000, thinkMs * 6);
  let rng: Rng = makeRng(options.seed ?? (Date.now() & 0x7fffffff));
  let pending: ReturnType<typeof setTimeout> | null = null;
  /** The seat the pending timer was scheduled for, so a re-entrant step() knows
   *  whether the existing timer is still the right one to wait on. */
  let pendingSeat: Seat | null = null;
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  let owedSince: number | null = null;
  let stopped = false;

  const clearPending = () => {
    if (pending !== null) {
      clearTimeout(pending);
      pending = null;
    }
    pendingSeat = null;
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

  const fire = (seat: Seat) => {
    pending = null;
    pendingSeat = null;
    if (stopped) return;
    // Re-check: a human may have acted, or the turn moved on, during the pause.
    if (botToMove() !== seat) {
      step();
      return;
    }
    let choice: { command: Command; rng: Rng } | null;
    try {
      choice = policies.get(seat)!.chooseMove(options.snapshot(), seat, rng);
    } catch (error) {
      // A throwing decision must not kill the driver. Report it, then leave the
      // store subscription live so the next change retries.
      let state: GameState | undefined;
      try {
        state = options.snapshot();
      } catch {
        /* snapshot itself threw — report without it */
      }
      options.onStuck?.({ reason: 'threw', seat, error, ...(state ? { state } : {}) });
      return;
    }
    if (choice === null) return;
    rng = choice.rng;
    owedSince = null;
    client.dispatch(choice.command);
  };

  const step = () => {
    if (stopped) return;
    const seat = botToMove();

    if (seat === null) {
      clearPending();
      return;
    }

    // A timer is already ticking for this same seat — let it run. Only reschedule
    // when there is none, or it was for a seat that no longer owes the move.
    if (pending !== null && pendingSeat === seat) return;

    clearPending();
    pendingSeat = seat;
    pending = setTimeout(() => fire(seat), thinkMs);
  };

  const unsubscribe = client.store.subscribe(step);

  // Watchdog: if the store has continuously said a bot is owed a move for far
  // longer than any decision should take, something has gone wrong (a starved
  // timer, a swallowed throw, a policy that keeps returning null). Force a fresh
  // attempt and report it. `owedSince` is driven here off the live store, not
  // off whether we managed to dispatch.
  watchdog = setInterval(() => {
    if (stopped) return;
    const seat = botToMove();
    if (seat === null) {
      owedSince = null;
      return;
    }
    if (owedSince === null) {
      owedSince = Date.now();
      return;
    }
    if (Date.now() - owedSince < watchdogMs) return;

    options.onStuck?.({ reason: 'watchdog', seat, state: options.snapshot() });
    owedSince = Date.now(); // don't spam; give the forced retry a full window
    clearPending();
    fire(seat);
  }, Math.max(200, Math.min(watchdogMs / 4, 1000)));

  step(); // in case a bot is already on the clock at attach time

  const detach = () => {
    stopped = true;
    clearPending();
    if (watchdog !== null) clearInterval(watchdog);
    unsubscribe();
  };

  const nudge = () => {
    const seat = botToMove();
    if (seat === null) return;
    clearPending();
    owedSince = Date.now();
    fire(seat);
  };

  return Object.assign(detach, { detach, nudge });
}
