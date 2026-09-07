import {
  activeSeat,
  createGame,
  reduce,
  replay,
  type Command,
  type EngineEvent,
  type GameState,
  type Rng,
  type Seat,
} from '@boomtown/engine';
import { clientView } from '@boomtown/client-core';
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

/**
 * One non-deterministic seed at room creation. This is the single point where
 * the online game introduces randomness; everything downstream (the deal, the
 * bot RNG, replay) is deterministic from it. `Math.random` is fine here — this
 * is the edge room object, not `@boomtown/engine`.
 */
function drawSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

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
  /** The room config with the seed resolved to a concrete value (see below). */
  private readonly config: RoomConfig;
  private readonly log: CommandLog;
  private readonly policies = new Map<Seat, Policy>();
  private botRngState: Rng;
  private state: GameState | null = null;
  private phase: 'lobby' | 'playing' | 'over' = 'lobby' as 'lobby' | 'playing' | 'over';
  /** True once the game is stuck (a replay error, a bricked bot loop). No commands are accepted. */
  private broken = false;

  constructor(
    readonly code: string,
    config: RoomConfig,
    store: KeyValueStore,
  ) {
    // Resolve the seed to a concrete number ONCE, here. `persistConfig` then
    // stores this resolved config, and `rehydrate` rebuilds the exact same
    // base game — so `replay()` converges (KTD13, R7). A per-call
    // `Math.random()` in `setupOptionsFor` would deal a different bag on every
    // wake and permanently brick the room.
    this.config = config.seed !== undefined ? config : { ...config, seed: drawSeed() };
    this.seats = new SeatTable(this.config);
    this.log = new CommandLog(store);
    for (const [seat, level] of Object.entries(this.config.bots)) {
      this.policies.set(Number(seat), heuristicPolicy({ level }));
    }
    this.botRngState = botRng(this.config.seed!);
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
        // A corrupt or engine-incompatible log. Do NOT throw — onStart re-runs
        // on every hibernation wake, so a throw here bricks the room code
        // forever. Park it read-only instead (see `command`).
        room.broken = true;
        return room;
      }
      room.state = result.state;
      room.phase = result.state.status === 'over' ? 'over' : 'playing';
      // Replay stops at the last stored command; if a bot is now on the clock,
      // resume the bot loop (a human command would otherwise be the only way to
      // un-stick the game). The caller dispatches the returned updates.
      room.pendingWakeUpdates = await room.runBots();
    }
    return room;
  }

  /** Bot updates produced during a wake, handed to the adapter to dispatch once. */
  pendingWakeUpdates: Outbound[] = [];

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
    if (this.broken) {
      return [this.rejection(fromSeat, command, protocolError('game-not-started', 'this room is stuck and cannot continue'))];
    }
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

    const applied = await this.applyAccepted(command, result.state, result.events);
    if (applied === null) {
      return [this.rejection(fromSeat, command, protocolError('malformed-message', 'the room could not save your move; try again'))];
    }
    return [...applied, ...(await this.runBots())];
  }

  /**
   * Persist an accepted command, then commit it to state and build the per-seat
   * updates. Append-before-commit (KTD13): a crash between the two loses
   * nothing, because on wake `replay()` re-derives this exact state. Returns
   * `null` when the persist failed — the caller must not treat the command as
   * applied, and `this.state` is left untouched.
   */
  private async applyAccepted(
    command: Command,
    nextState: GameState,
    events: readonly EngineEvent[],
  ): Promise<Outbound[] | null> {
    try {
      await this.log.append(command);
    } catch {
      return null;
    }
    this.state = nextState;
    if (nextState.status === 'over') this.phase = 'over';
    return this.seatUpdates(events);
  }

  /**
   * Drive every consecutive bot seat until a human is on the clock or the game
   * ends. Each bot command is persisted before its effects are observable, the
   * same contract as a human command. A stuck bot loop or a persist failure
   * parks the room read-only rather than throwing out of the PartyKit lifecycle.
   */
  private async runBots(): Promise<Outbound[]> {
    const out: Outbound[] = [];
    let guard = 0;
    while (this.state) {
      if (guard++ > 5000) {
        this.broken = true;
        return [...out, this.roomBroken('the bot loop did not terminate')];
      }
      const seat = seatOnClock(this.state);
      if (seat === null || !this.seats.isBot(seat)) return out;
      const policy = this.policies.get(seat)!;
      const choice = policy.chooseMove(this.state, seat, this.botRngState);
      if (!choice) return out;
      this.botRngState = choice.rng;
      const result = reduce(this.state, choice.command);
      if (!result.ok) {
        this.broken = true;
        return [...out, this.roomBroken(`a bot emitted an illegal ${choice.command.type}`)];
      }
      const applied = await this.applyAccepted(choice.command, result.state, result.events);
      if (applied === null) {
        return [...out, this.roomBroken('the room could not save a bot move')];
      }
      out.push(...applied);
    }
    return out;
  }

  /** Broadcast that the game is stuck. Followed by `command` refusing every move. */
  private roomBroken(reason: string): Outbound {
    this.broken = true;
    return { kind: 'broadcast', message: { type: 'error', error: protocolError('game-not-started', `the game is stuck: ${reason}`) } };
  }

  // --- outbound helpers ------------------------------------------------

  /** One `update` per seat, each with that seat's filtered view. */
  private seatUpdates(events: readonly EngineEvent[]): Outbound[] {
    if (!this.state) return [];
    const state = this.state;
    return this.seats.liveConnections().map(({ seat }) => ({
      kind: 'to-seat' as const,
      seat,
      message: { type: 'update' as const, view: clientView(state, seat), events },
    }));
  }

  currentUpdateFor(seat: Seat): RoomMessage | null {
    if (!this.state) return null;
    return { type: 'update', view: clientView(this.state, seat), events: [] };
  }

  private rejection(seat: Seat, command: Command, error: WireError): Outbound {
    if (!this.state) return { kind: 'to-seat', seat, message: this.errorMessage(error) };
    return {
      kind: 'to-seat',
      seat,
      message: { type: 'update', view: clientView(this.state, seat), events: [], rejection: { command, error } },
    };
  }

  private errorMessage(error: WireError): RoomMessage {
    return { type: 'error', error };
  }
}
