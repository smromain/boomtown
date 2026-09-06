import type { PlayerView } from '@boomtown/engine';
import type { GameClientState } from './store.js';
import type { TransportMessage } from './transport/types.js';

function firstView(views: Record<number, PlayerView>): PlayerView | undefined {
  for (const key in views) return views[key];
  return undefined;
}

/**
 * Fold one authoritative update into client state. A rejection clears the
 * in-flight echo and surfaces the typed error, leaving the last good views
 * untouched. Otherwise the new views replace the old, the log grows, and the
 * echo clears.
 */
export function reconcile(state: GameClientState, message: TransportMessage): GameClientState {
  if (message.rejection) {
    return { ...state, inFlight: null, lastError: message.rejection.error };
  }

  const views = { ...state.views, ...message.views };
  const sample = firstView(views);
  const pending =
    Object.values(views)
      .map((view) => view.pendingDecision)
      .find((decision) => decision != null) ?? null;

  return {
    ...state,
    status: sample?.status === 'over' ? 'over' : 'ready',
    views,
    activeSeat: sample?.activeSeat ?? state.activeSeat,
    pendingDecision: pending,
    inFlight: null,
    lastError: null,
    log: message.events.length > 0 ? [...state.log, ...message.events] : state.log,
  };
}
