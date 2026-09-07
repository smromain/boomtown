import {
  activeSeat,
  createGame,
  reduce,
  replay,
  viewFor,
  type Command,
  type EngineEvent,
  type GameState,
  type Seat,
} from '@boomtown/engine';
import { heuristicPolicy, botRng, type Policy } from '@boomtown/ai';
import {
  PROTOCOL_VERSION,
  protocolError,
  wireEngineError,
  type RoomConfig,
  type RoomMessage,
  type RoomState,
  type WireError,
} from '@boomtown/protocol';
import { CommandLog, type KeyValueStore } from './storage.js';
import { SeatTable, configError, setupOptionsFor } from './seats.js';

/** The seat that owes the next command, or null when the game is over. */
export function seatOnClock(state: GameState): Seat | null {
  if (state.status !== 'playing') return null;
  return state.merger?.pending?.seat ?? activeSeat(state);
}

/** What the room sends to one seat's connection. */
export type Outbound =
  | { readonly kind: 'to-seat'; readonly seat: Seat; readonly message: RoomMessage }
  | { readonly kind: 'broadcast'; readonly message: RoomMessage };

/**
 * The authoritative game for one room, independent of PartyKit. It holds the
 * `GameState`, applies commands through the one `reduce` path (KTD6), persists
 * each command before its events go out (KTD13), plays bot seats inline
 * (KTD7 — the edge has no worker threads and the policy is synchronous), and
 * returns the messages to send. The PartyKit adapter (`room.ts`) owns sockets
 * and wires `party.storage` in as the `KeyValueStore`.
 */
export class GameRoom {
  readonly seats: SeatTable;
  private readonly log: CommandLog;
  private readonly policies = new Map<Seat, Policy>();
  private botRngState = botRng(1);
  private state: GameState | null = null;
  private phase: 'lobby' | 'playing' | 'over' = 'lobby';

  constructor(
    readonly code: string,
    private readonly config: RoomConfig,
    store: KeyValueStore,
  ) {
    this.seats = new SeatTable(config);
    this.log = new CommandLog(store);
    for (const [seat, level] of Object.entries(config.bots)) {
      this.policies.set(Number(seat), heuristicPolicy({ level }));
    }
    if (config.seed !== undefined) this.botRngState = botRng(config.seed);
  }

  /** Rehydrate a woken room from its stored config + command log (KTD13, R7). */
  static async rehydrate(code: string, store: KeyValueStore): Promise<GameRoom | null> {
    const log = new CommandLog(store);
    const config = await log.loadConfig<RoomConfig>();
    if (!config) return null;
    const room = new GameRoom(code, config, store);
    const commands = await log.loadAll();
    if (commands.length > 0) {
      const base = createGame(setupOptionsFor(config));
      const result = replay(base, commands);
      if ('error' in result) {
        throw new Error(`replay failed after ${result.applied} commands: ${result.error.code}`);
      }
      room.state = result.state;
      room.phase = result.state.status === 'over' ? 'over' : 'playing';
    }
    return room;
  }

  roomState(): RoomState {
    return this.seats.snapshot(this.code, this.phase);
  }

  isPlaying(): boolean {
    return this.phase === 'playing' && this.state !== null;
  }

  /** Persist the config so a woken room can rebuild (call once, at creation). */
  async persistConfig(): Promise<void> {
    await this.log.saveConfig(this.config);
  }

  // --- lobby ------------------------------------------------------------

  helloVersionError(protocolVersion: string): WireError | null {
    if (protocolVersion === PROTOCOL_VERSION) return null;
    return protocolError(
      'wrong-version',
      `room speaks protocol ${PROTOCOL_VERSION}, client sent ${protocolVersion}`,
    );
  }

  /** A fresh joiner takes a seat, or `null` if the room is full. */
  join(name: string, token: string, connectionId: string): { seat: Seat } | null {
    return this.seats.join(name, token, connectionId);
  }

  /** A reconnecting client re-binds its seat by token, or `null` if unknown. */
  reconnect(token: string, connectionId: string): { seat: Seat } | null {
    return this.seats.reconnect(token, connectionId);
  }

  /**
   * Restore a seat<-token<-connection binding after a hibernation wake. The
   * `SeatTable` is rebuilt empty from config on `rehydrate`; the adapter feeds
   * each live connection's persisted `{ seat, token }` back through here.
   */
  restoreSeat(seat: Seat, token: string, name: string, connectionId: string): void {
    this.seats.restore(seat, token, name, connectionId);
  }

  markDisconnected(connectionId: string): void {
    this.seats.disconnect(connectionId);
  }

  /** Start the game. Returns the initial per-seat updates, or an error. */
  async start(): Promise<{ updates: Outbound[] } | { error: WireError }> {
    if (this.phase !== 'lobby') {
      return { error: protocolError('game-not-started', 'game already started') };
    }
    const bad = configError(this.config);
    if (bad) return { error: protocolError('malformed-message', bad) };
    if (!this.seats.allSeatsFilled()) {
      return { error: protocolError('game-not-started', 'seats are not all filled') };
    }

    this.state = createGame(setupOptionsFor(this.config));
    this.phase = 'playing';
    const updates: Outbound[] = [
      { kind: 'broadcast', message: { type: 'room-state', state: this.roomState() } },
      ...this.seatUpdates([]),
    ];
    return { updates: [...updates, ...(await this.runBots())] };
  }

  // --- play ------------------------------------------------------------

  /**
   * Apply one command from `fromSeat`. Rejects an out-of-turn or illegal
   * command to that seat only (R3); otherwise persists it (KTD13 — before its
   * events are observable, R7), applies it, sends each connection its filtered
   * update, then plays any bot turns that follow.
   */
  async command(fromSeat: Seat, command: Command): Promise<Outbound[]> {
    if (!this.state || this.phase !== 'playing') {
      return [{ kind: 'to-seat', seat: fromSeat, message: this.errorMessage(protocolError('game-not-started', 'no game in progress')) }];
    }
    if (command.seat !== fromSeat) {
      return [this.rejection(fromSeat, command, protocolError('not-in-room', `seat ${command.seat} is not yours`))];
    }
    if (seatOnClock(this.state) !== fromSeat) {
      return [this.rejection(fromSeat, command, wireEngineError({ code: 'not-your-turn', message: 'not your turn' }))];
    }

    const result = reduce(this.state, command);
    if (!result.ok) {
      return [this.rejection(fromSeat, command, wireEngineError(result.error))];
    }

    const updates = await this.applyAccepted(command, result.state, result.events);
    return [...updates, ...(await this.runBots())];
  }

  /**
   * Persist an accepted command, then commit it to state and build the per-seat
   * updates. Append-before-commit (KTD13): a crash between the two loses
   * nothing, because on wake `replay()` re-derives this exact state.
   */
  private async applyAccepted(
    command: Command,
    nextState: GameState,
    events: readonly EngineEvent[],
  ): Promise<Outbound[]> {
    await this.log.append(command);
    this.state = nextState;
    if (nextState.status === 'over') this.phase = 'over';
    return this.seatUpdates(events);
  }

  /**
   * Drive every consecutive bot seat until a human is on the clock or the game
   * ends. Each bot command is persisted before its effects are observable, the
   * same contract as a human command.
   */
  private async runBots(): Promise<Outbound[]> {
    const out: Outbound[] = [];
    let guard = 0;
    while (this.state) {
      if (guard++ > 5000) throw new Error('bot loop did not terminate');
      const seat = seatOnClock(this.state);
      if (seat === null || !this.seats.isBot(seat)) return out;
      const policy = this.policies.get(seat)!;
      const choice = policy.chooseMove(this.state, seat, this.botRngState);
      if (!choice) return out;
      this.botRngState = choice.rng;
      const result = reduce(this.state, choice.command);
      if (!result.ok) {
        throw new Error(`bot at seat ${seat} emitted an illegal ${choice.command.type}: ${result.error.code}`);
      }
      out.push(...(await this.applyAccepted(choice.command, result.state, result.events)));
    }
    return out;
  }

  // --- outbound helpers ------------------------------------------------

  /** One `update` per seat, each with that seat's filtered view. */
  private seatUpdates(events: readonly EngineEvent[]): Outbound[] {
    if (!this.state) return [];
    const state = this.state;
    return this.seats.liveConnections().map(({ seat }) => ({
      kind: 'to-seat' as const,
      seat,
      message: { type: 'update' as const, view: viewFor(state, seat), events },
    }));
  }

  currentUpdateFor(seat: Seat): RoomMessage | null {
    if (!this.state) return null;
    return { type: 'update', view: viewFor(this.state, seat), events: [] };
  }

  private rejection(seat: Seat, command: Command, error: WireError): Outbound {
    if (!this.state) return { kind: 'to-seat', seat, message: this.errorMessage(error) };
    return {
      kind: 'to-seat',
      seat,
      message: { type: 'update', view: viewFor(this.state, seat), events: [], rejection: { command, error } },
    };
  }

  private errorMessage(error: WireError): RoomMessage {
    return { type: 'error', error };
  }
}
