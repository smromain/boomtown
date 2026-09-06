import type { Command, EngineError, EngineEvent, PendingDecision, PlayerView, Seat } from '@boomtown/engine';

/**
 * Everything the UI renders from. `views` holds the filtered `PlayerView` for
 * each seat this client controls; panels read the active seat's view for the
 * board, hand, market, and holdings. `inFlight` is the optimistic echo — a
 * command awaiting authoritative confirmation, used to disable inputs.
 */
export interface GameClientState {
  status: 'connecting' | 'ready' | 'over';
  views: Record<Seat, PlayerView>;
  /** Whose turn it is (or who owns the open decision). */
  activeSeat: Seat | null;
  /** An open merger decision, addressed to whichever controlled seat owns it. */
  pendingDecision: PendingDecision | null;
  /** A command sent but not yet confirmed or rejected. */
  inFlight: Command | null;
  lastError: EngineError | null;
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
export function activeView(state: GameClientState): PlayerView | null {
  return state.activeSeat == null ? null : (state.views[state.activeSeat] ?? null);
}

/** The controlled seat that owns the open decision, if any. */
export function decidingSeat(state: GameClientState): Seat | null {
  if (!state.pendingDecision) return null;
  const owner = Object.entries(state.views).find(
    ([, view]) => view.pendingDecision != null,
  );
  return owner ? Number(owner[0]) : null;
}
