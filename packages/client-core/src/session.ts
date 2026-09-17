import {
  createGame,
  reduce,
  retrospective,
  type Command,
  type EngineError,
  type EngineEvent,
  type GameState,
  type Retrospective,
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
  /**
   * The deal, and every command accepted since — the substrate the end-of-game
   * record replays (#68, #69). Kept rather than derived because the *local*
   * transports have no command log of their own; the room has one already and
   * builds its own record from that. A session rebuilt from a snapshot has
   * neither, and says so by handing back `null`.
   */
  private readonly initial: GameState | null;
  private readonly log: Command[] = [];

  constructor(init: SetupOptions | { readonly snapshot: GameState }) {
    this.state = 'snapshot' in init ? init.snapshot : createGame(init);
    this.initial = 'snapshot' in init ? null : this.state;
  }

  /** Rebuild a session from a persisted snapshot (U17). */
  static fromSnapshot(state: GameState): GameSession {
    return new GameSession({ snapshot: state });
  }

  apply(command: Command): SessionResult {
    const result = reduce(this.state, command);
    if (!result.ok) return { ok: false, error: result.error };
    this.state = result.state;
    this.log.push(command);
    return { ok: true, events: result.events };
  }

  /**
   * The end-of-game record, rebuilt from this session's own log. Null before
   * the game is over — there is nothing to look back on yet — and null for a
   * session restored from a snapshot, which has no history to replay.
   */
  retrospective(): Retrospective | null {
    if (this.initial === null || this.state.status !== 'over') return null;
    return retrospective(this.initial, this.log);
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
