import {
  createGame,
  reduce,
  type Command,
  type EngineError,
  type EngineEvent,
  type GameState,
  type Seat,
  type SetupOptions,
} from '@boomtown/engine';
import { clientView, type ClientView } from './view.js';

export type SessionResult =
  | { readonly ok: true; readonly events: readonly EngineEvent[] }
  | { readonly ok: false; readonly error: EngineError };

/**
 * A stateful wrapper around the pure engine: it holds the authoritative
 * `GameState` and applies commands. `LocalTransport` uses one directly; the
 * engine Web Worker holds one behind `postMessage`; the multiplayer server
 * (U16) will hold one per room. There is exactly one `reduce` code path (KTD5).
 */
export class GameSession {
  private state: GameState;

  constructor(init: SetupOptions | { readonly snapshot: GameState }) {
    this.state = 'snapshot' in init ? init.snapshot : createGame(init);
  }

  /** Rebuild a session from a persisted snapshot (U17). */
  static fromSnapshot(state: GameState): GameSession {
    return new GameSession({ snapshot: state });
  }

  apply(command: Command): SessionResult {
    const result = reduce(this.state, command);
    if (!result.ok) return { ok: false, error: result.error };
    this.state = result.state;
    return { ok: true, events: result.events };
  }

  /** Filtered views for the given seats — every seat in hot-seat, one seat online (KTD4). */
  viewsFor(seats: readonly Seat[]): Record<Seat, ClientView> {
    const views: Record<number, ClientView> = {};
    for (const seat of seats) views[seat] = clientView(this.state, seat);
    return views;
  }

  snapshot(): GameState {
    return this.state;
  }
}
