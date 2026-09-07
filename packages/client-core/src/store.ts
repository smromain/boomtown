import type { Command, EngineEvent, PendingDecision, Seat } from '@boomtown/engine';
import type { RejectionError } from './transport/types.js';
import type { ClientView } from './view.js';

/**
 * Everything the UI renders from. `views` holds the filtered `ClientView` for
 * each seat this client controls; panels read the active seat's view for the
 * board, hand, market, and holdings. `inFlight` is the optimistic echo — a
 * command awaiting authoritative confirmation, used to disable inputs.
 */
export interface GameClientState {
  status: 'connecting' | 'ready' | 'over';
  views: Record<Seat, ClientView>;
  /** Whose turn it is (or who owns the open decision). */
  activeSeat: Seat | null;
  /** An open merger decision, addressed to whichever controlled seat owns it. */
  pendingDecision: PendingDecision | null;
  /** A command sent but not yet confirmed or rejected. */
  inFlight: Command | null;
  lastError: RejectionError | null;
  log: EngineEvent[];
}

export function initialClientState(): GameClientState {
  return {
    status: 'connecting',
    views: {},
    activeSeat: null,
    pendingDecision: null,
    inFlight: null,
    lastError: null,
    log: [],
  };
}

/** The active seat's filtered view, or null before the first update. */
export function activeView(state: GameClientState): ClientView | null {
  return state.activeSeat == null ? null : (state.views[state.activeSeat] ?? null);
}

/**
 * The active seat's view **only when that seat is one a local player controls**
 * — otherwise null. `local` is the set of seats the person at this screen plays:
 * every human seat in hot-seat, the one own seat online. A bot's turn (or, online,
 * a remote player's turn) yields null so the UI can show a waiting state instead
 * of the active seat's board and prompts (which would otherwise be clickable and
 * dispatch commands for a seat the player doesn't own).
 *
 * The engine still rejects a wrong-seat command; this keeps the surface that
 * produces one off the screen in the first place.
 */
export function localActiveView(
  state: GameClientState,
  local: Iterable<Seat>,
): ClientView | null {
  if (state.activeSeat == null) return null;
  const seats = local instanceof Set ? local : new Set(local);
  return seats.has(state.activeSeat) ? (state.views[state.activeSeat] ?? null) : null;
}

/** Whether the seat on the clock is one a local player controls. */
export function isLocalTurn(state: GameClientState, local: Iterable<Seat>): boolean {
  if (state.activeSeat == null) return false;
  const seats = local instanceof Set ? local : new Set(local);
  return seats.has(state.activeSeat);
}

/** Any seat's view — they all carry the public board, the log tail, and (once
 *  the game ends) the result. Use it for spectator-safe reads that don't depend
 *  on whose turn it is. */
export function anyView(state: GameClientState): ClientView | null {
  for (const key in state.views) return state.views[key] ?? null;
  return null;
}

/** The final result once the game is over, else null. */
export function gameResult(state: GameClientState): ClientView['result'] {
  if (state.status !== 'over') return null;
  return anyView(state)?.result ?? null;
}

/** The controlled seat that owns the open decision, if any. */
export function decidingSeat(state: GameClientState): Seat | null {
  if (!state.pendingDecision) return null;
  const owner = Object.entries(state.views).find(
    ([, view]) => view.pendingDecision != null,
  );
  return owner ? Number(owner[0]) : null;
}
