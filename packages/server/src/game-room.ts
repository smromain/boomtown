import {
  activeSeat,
  createGame,
  reduce,
  replay,
  retrospective,
  type Command,
  type EngineEvent,
  type GameState,
  redactEventsFor,
  tableView,
  type Retrospective,
  type Rng,
  type Seat,
} from '@boomtown/engine';
import { clientView } from '@boomtown/client-core';
import { heuristicPolicy, botRng, type Policy } from '@boomtown/ai';
import type { Knocker } from '@boomtown/protocol';
import {
  PROTOCOL_VERSION,
  protocolError,
  wireEngineError,
  type RoomConfig,
  type RoomMessage,
  type RoomState,
  type WireError,
} from '@boomtown/protocol';
import { roomLog, roomWarn } from './log.js';
import { CommandLog, type KeyValueStore } from './storage.js';
import { SeatTable, configError, setupOptionsFor } from './seats.js';
import { LIFECYCLE, atCommandCeiling } from './lifecycle.js';
import { Door } from './admission.js';
import { mintToken, tokensMatch } from './tokens.js';

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
  // Either machine can own the clock: a merger decision, or a vote on a motion.
  return state.merger?.pending?.seat ?? state.motion?.pending?.seat ?? activeSeat(state);
}

/** What the room sends to one seat's connection, to the couch table, or to everyone. */
export type Outbound =
  | { readonly kind: 'to-seat'; readonly seat: Seat; readonly message: RoomMessage }
  | { readonly kind: 'to-table'; readonly message: RoomMessage }
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
  /**
   * True once the game has been dealt, persisted alongside the lobby facts. It
   * is what `phase` is restored from when the log is still empty, and what
   * `start()` checks so a woken room can never be re-dealt (#63).
   */
  private started = false;

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
    roomLog(code, 'game room constructed', {
      seatCount: this.config.seatCount,
      edition: this.config.edition,
      visibility: this.config.visibility,
      bots: this.config.bots,
      seed: this.config.seed,
    });
  }

  /** Rehydrate a woken room from its stored config + command log (KTD13, R7). */
  static async rehydrate(code: string, store: KeyValueStore): Promise<GameRoom | null> {
    const log = new CommandLog(store);
    const config = await log.loadConfig<RoomConfig>();
    if (!config) return null;
    const room = new GameRoom(code, config, store);
    const lobby = await log.loadLobby();
    if (lobby) {
      room.hostSeat = lobby.hostSeat;
      room.tableHosted = lobby.table ?? false;
      room.door.locked = lobby.locked;
      room.started = lobby.started ?? false;
      room.seats.restoreEjected(lobby.ejected ?? []);
      for (const seat of lobby.ejected ?? []) {
        if (!room.policies.has(seat)) {
          room.policies.set(seat, heuristicPolicy({ level: room.seats.botDifficulty(seat) }));
        }
      }
    }
    const commands = await log.loadAll();
    // Bot names are known deterministically here; human names arrive later as
    // the adapter feeds connections back through `restoreSeat`, which patches
    // them into the live state. Names never affect the deal (KTD13).
    if (commands.length === 0) {
      // A dealt game that nobody has moved in yet. The log cannot say so — only
      // the durable `started` marker can — and the base game is exactly what
      // `start()` built, because the seed was resolved once and persisted (#63).
      if (room.started) {
        room.state = createGame(setupOptionsFor(config, room.seats.displayNames()));
        room.phase = 'playing';
        roomLog(code, 'rehydrated a started game with an empty log', {
          onClock: seatOnClock(room.state),
        });
        room.pendingWakeUpdates = await room.runBots();
      }
      return room;
    }

    const base = createGame(setupOptionsFor(config, room.seats.displayNames()));
    const result = replay(base, commands);
    if ('error' in result) {
      roomWarn(code, 'replay failed — parking the room read-only', {
        commands: commands.length,
        error: result.error,
      });
      // A corrupt or engine-incompatible log. Do NOT throw — onStart re-runs
      // on every hibernation wake, so a throw here bricks the room code
      // forever. Park it read-only instead (see `command`).
      room.broken = true;
      return room;
    }
    room.state = result.state;
    // A non-empty log is itself proof the game started, whatever the marker
    // says — rooms written before the marker existed wake up through here.
    room.started = true;
    room.phase = result.state.status === 'over' ? 'over' : 'playing';
    roomLog(code, 'rehydrated from the command log', {
      commands: commands.length,
      phase: room.phase,
      onClock: seatOnClock(result.state),
    });
    // Replay stops at the last stored command; if a bot is now on the clock,
    // resume the bot loop (a human command would otherwise be the only way to
    // un-stick the game). The caller dispatches the returned updates.
    room.pendingWakeUpdates = await room.runBots();
    return room;
  }

  /** Bot updates produced during a wake, handed to the adapter to dispatch once. */
  pendingWakeUpdates: Outbound[] = [];

  /**
   * The ticket this room is currently shareable by, or null once it expired or
   * was retired. Set by the adapter after the directory accepts a claim; not
   * persisted, because a ticket outlives neither its TTL nor the lobby.
   */
  ticket: string | null = null;

  /** Who is waiting at the door, and whether it is open at all. */
  readonly door = new Door();

  /**
   * The seat allowed to admit, decline, lock, eject and start — the one the
   * creator took, or null when a couch table hosts. Persisted, because it has
   * to survive a hibernation wake: a room that forgot who its host was would
   * either have no one able to admit, or everyone.
   */
  hostSeat: Seat | null = 0;

  /**
   * Whether a couch table created this room and hosts it (#62). Persisted with
   * the host seat, for the same reason: a woken room must still know that its
   * host is the table, even if the table's socket was down across the wake.
   */
  tableHosted = false;

  /**
   * The table's token and the connection holding it. Held here rather than in
   * the lobby record, exactly like seat tokens: the adapter keeps the token in
   * the connection's own persisted state and hands it back after a wake.
   */
  private table: { token: string; connectionId: string | null } | null = null;

  /** Write the lobby facts a wake must not lose: host, lock, ejected seats, started, table. */
  async persistLobby(): Promise<void> {
    await this.log.saveLobby({
      hostSeat: this.hostSeat,
      locked: this.door.locked,
      ejected: this.seats.ejectedSeats(),
      started: this.started,
      table: this.tableHosted,
    });
  }

  // --- the couch table (#62) --------------------------------------------

  /**
   * Make `connectionId` this room's table: host authority, no seat. Returns the
   * table's token. Called once, at creation — a room has at most one table, and
   * `create-room` is refused once the room exists, so no second connection can
   * claim the role.
   */
  async becomeTable(connectionId: string): Promise<string> {
    const token = mintToken();
    this.table = { token, connectionId };
    this.tableHosted = true;
    this.hostSeat = null;
    await this.persistLobby();
    roomLog(this.code, 'the creator is the table');
    return token;
  }

  /**
   * The table coming back by token. Like a seat's, the token rotates on use, so
   * a captured one buys a single reconnect. Returns the fresh token, or null if
   * this is not the table's token.
   */
  reconnectTable(token: string, connectionId: string): string | null {
    if (!this.table || !tokensMatch(this.table.token, token)) return null;
    const rotated = mintToken();
    this.table = { token: rotated, connectionId };
    // A new connection has not asked to be waited on yet.
    this.paced = false;
    return rotated;
  }

  // --- pacing bots to the table (#62, U38) --------------------------------

  /**
   * True once the table on its current connection has sent `pace`. A table that
   * never does is never waited on, which is also what keeps every older client
   * and every test that does not care about pacing exactly as it was.
   */
  private paced = false;
  /** Whether the table has taken in the last update and is not mid-beat. */
  private tableReady = true;

  /** The table says a covering beat has started (`true`) or that it is idle (`false`). */
  tablePace(holding: boolean): void {
    this.paced = true;
    this.tableReady = !holding;
  }

  /** Whether bots are being played one move at a time, to the table's beat. */
  isPaced(): boolean {
    return this.paced && this.tableConnection() !== null;
  }

  /** Whether a bot owes the next command and nothing but pacing is stopping it. */
  botWaiting(): boolean {
    if (!this.state || this.broken || this.phase !== 'playing') return false;
    const seat = seatOnClock(this.state);
    return seat !== null && this.seats.isBot(seat);
  }

  /**
   * Play what the bots owe. `force` plays one move even though the table has not
   * said it is ready — the cap the adapter enforces, so a table that goes quiet
   * mid-beat costs the game a pause rather than the game.
   */
  async stepBots(force = false): Promise<Outbound[]> {
    if (force) this.tableReady = true;
    return this.runBots();
  }

  /** Restore the table's binding after a hibernation wake, from the connection's state. */
  restoreTable(token: string, connectionId: string): void {
    if (!this.tableHosted) return;
    // A live binding is the truth; persisted state only fills an empty one.
    if (this.table?.connectionId) return;
    this.table = { token, connectionId };
  }

  /** Whether this connection is the table. */
  isTable(connectionId: string): boolean {
    return this.table?.connectionId === connectionId;
  }

  /** The table's current connection, or null when it is away. */
  tableConnection(): string | null {
    return this.table?.connectionId ?? null;
  }

  /** The table's current update, for a reconnect. Null before the deal. */
  currentTableUpdate(): RoomMessage | null {
    if (!this.state || !this.tableHosted) return null;
    return { type: 'table-update', view: tableView(this.state), events: [] };
  }

  /**
   * Hand a seat from the human holding it to a bot, and carry on.
   *
   * The seat never reopens (see `SeatTable.eject`). If the ejected seat was the
   * one on the clock, the game would otherwise sit waiting on somebody who is
   * gone, so the bot loop is kicked here and its moves go out like any other.
   */
  async ejectSeat(seat: Seat): Promise<Outbound[] | null> {
    if (!this.seats.eject(seat)) return null;
    if (!this.policies.has(seat)) {
      this.policies.set(seat, heuristicPolicy({ level: this.seats.botDifficulty(seat) }));
    }
    await this.persistLobby();
    roomLog(this.code, 'a seat was ejected and is now played by a bot', { seat });
    return [
      { kind: 'broadcast', message: { type: 'room-state', state: this.roomState() } },
      ...(await this.runBots()),
    ];
  }

  /**
   * `knocks` is filled in per-recipient by the adapter: only the host is told
   * who is waiting. Everyone else gets the same room state with an empty queue,
   * so the lobby cannot be used to watch who is trying to get in.
   */
  roomState(knocks: readonly Knocker[] = []): RoomState {
    return this.seats.snapshot(this.ticket, this.phase, {
      hostSeat: this.hostSeat,
      table: this.tableHosted,
      knocks,
      locked: this.door.locked,
    });
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

  /**
   * A reconnecting client re-binds its seat by token, or `null` if unknown.
   * The returned token is a *fresh* one: the presented token is invalidated by
   * the act of using it, so a captured token buys one reconnect and no more.
   * The caller must send it back and persist it in place of the old one.
   */
  reconnect(token: string, connectionId: string): { seat: Seat; token: string } | null {
    return this.seats.reconnect(token, connectionId);
  }

  /**
   * Restore a seat<-token<-connection binding after a hibernation wake. The
   * `SeatTable` is rebuilt empty from config on `rehydrate`; the adapter feeds
   * each live connection's persisted `{ seat, token }` back through here.
   */
  restoreSeat(seat: Seat, token: string, name: string, connectionId: string): void {
    // The stored name, not the raw one: `SeatTable` trims, caps and
    // de-duplicates, and patching the unnormalised name into engine state below
    // would leave the two disagreeing about what this seat is called.
    const stored = this.seats.restore(seat, token, name, connectionId);
    // On a hibernation wake the replay base is built with `Seat N` placeholders
    // (the SeatTable is empty until the adapter feeds connections back through
    // here). Names are cosmetic and never affect the deal, so patch the real
    // one into the live state as each seat comes back.
    if (this.state && this.state.seats[seat] && this.state.seats[seat]!.name !== stored) {
      this.state = {
        ...this.state,
        seats: this.state.seats.map((s, i) => (i === seat ? { ...s, name: stored } : s)),
      };
    }
  }

  markDisconnected(connectionId: string): void {
    this.seats.disconnect(connectionId);
    if (this.table?.connectionId === connectionId) {
      this.table = { ...this.table, connectionId: null };
      this.paced = false;
    }
  }

  /** Start the game. Returns the initial per-seat updates, or an error. */
  async start(): Promise<{ updates: Outbound[] } | { error: WireError }> {
    if (this.phase !== 'lobby' || this.started) {
      roomWarn(this.code, 'start refused — not in the lobby', { phase: this.phase });
      return { error: protocolError('game-already-started', 'game already started') };
    }
    // Defence in depth against this class of bug coming back (#63): whatever
    // the in-memory phase says, a room with a durable trace of having started
    // must never be re-dealt. Re-dealing is silent rather than loud — the seed
    // is persisted, so the second deal is identical to the first — so the check
    // is worth its two storage reads, which only a lobby `start` ever pays.
    const durable = await this.log.loadLobby();
    if (durable?.started || (await this.log.count()) > 0) {
      roomWarn(this.code, 'start refused — storage says this room already started', {});
      return { error: protocolError('game-already-started', 'game already started') };
    }
    const bad = configError(this.config);
    if (bad) {
      roomWarn(this.code, 'start refused — bad config', { reason: bad, config: this.config });
      return { error: protocolError('malformed-message', bad) };
    }
    if (!this.seats.allSeatsFilled()) {
      roomWarn(this.code, 'start refused — seats are not all filled', {
        seats: this.roomState().seats.map((s) => `${s.index}:${s.kind}`),
      });
      return { error: protocolError('game-not-started', 'seats are not all filled') };
    }

    this.state = createGame(setupOptionsFor(this.config, this.seats.displayNames()));
    this.phase = 'playing';
    this.started = true;
    // A paced table takes the deal in before a bot plays on it.
    if (this.isPaced()) this.tableReady = false;
    // Before the updates go out, the same order the command log keeps: nothing
    // is observable until the fact that produced it is durable (KTD13, R7).
    await this.persistLobby();
    roomLog(this.code, 'game started', { seed: this.config.seed, onClock: seatOnClock(this.state) });
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
    if (this.phase === 'over') {
      // Distinct from "never started": a last click landing after the final
      // standings is an ordinary race, and being told there is no game when the
      // game is on screen is the confusing part.
      return [this.rejection(fromSeat, command, protocolError('game-over', 'this game has finished'))];
    }
    if (!this.state || this.phase !== 'playing') {
      return [{ kind: 'to-seat', seat: fromSeat, message: this.errorMessage(protocolError('game-not-started', 'no game in progress')) }];
    }
    if (command.seat !== fromSeat) {
      return [this.rejection(fromSeat, command, protocolError('not-in-room', `seat ${command.seat} is not yours`))];
    }
    if (seatOnClock(this.state) !== fromSeat) {
      roomWarn(this.code, 'command out of turn', {
        from: fromSeat,
        command: command.type,
        onClock: seatOnClock(this.state),
      });
      return [this.rejection(fromSeat, command, wireEngineError({ code: 'not-your-turn', message: 'not your turn' }))];
    }

    // The room's total command ceiling. Checked before `reduce` so an exhausted
    // room costs a counter read rather than an engine pass, and refused with a
    // terminal error rather than by growing — the log stays consistent and the
    // game stays replayable at whatever point it stopped.
    if (atCommandCeiling(await this.log.count())) {
      roomWarn(this.code, 'room hit its command ceiling', { limit: LIFECYCLE.maxCommands });
      return [
        this.rejection(
          fromSeat,
          command,
          protocolError('room-exhausted', 'this room has run for too long to continue'),
        ),
      ];
    }

    const result = reduce(this.state, command);
    if (!result.ok) {
      roomWarn(this.code, 'command rejected by the engine', {
        from: fromSeat,
        command: command.type,
        error: result.error,
      });
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
    // Paced: the table has to take this update in before a bot plays on it.
    if (this.isPaced()) this.tableReady = false;
    if (nextState.status === 'over') {
      this.phase = 'over';
      return this.seatUpdates(events, await this.endRecord());
    }
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
        roomWarn(this.code, 'the bot loop did not terminate', { commands: out.length });
        this.broken = true;
        return [...out, this.roomBroken('the bot loop did not terminate')];
      }
      const seat = seatOnClock(this.state);
      if (seat === null || !this.seats.isBot(seat)) return out;
      // Paced to the table (#62): one bot move per `ready`, and the adapter
      // arms a cap so this can never become a stall.
      if (this.isPaced() && !this.tableReady) return out;
      const policy = this.policies.get(seat)!;
      const choice = policy.chooseMove(this.state, seat, this.botRngState);
      if (!choice) return out;
      this.botRngState = choice.rng;
      const result = reduce(this.state, choice.command);
      if (!result.ok) {
        roomWarn(this.code, 'a bot emitted an illegal command', {
          seat,
          command: choice.command.type,
          error: result.error,
        });
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
    roomWarn(this.code, 'room broken', { reason });
    this.broken = true;
    return { kind: 'broadcast', message: { type: 'error', error: protocolError('game-not-started', `the game is stuck: ${reason}`) } };
  }

  // --- outbound helpers ------------------------------------------------

  /**
   * One `update` per seat, each with that seat's filtered view **and** that
   * seat's filtered events — and, at a couch table, one `table-update` with the
   * public view and the events as a reader with no seat may see them (#62).
   *
   * The events used to be one shared array handed to everyone while only the
   * view was per-seat — so a closed table's purchase quantities and costs went
   * out on the wire to every connection, one devtools panel from being read
   * (#60). `redactEventsFor` is the same helper the local transport uses, so
   * hot-seat and online hide the same things.
   */
  private seatUpdates(events: readonly EngineEvent[], record?: Retrospective): Outbound[] {
    if (!this.state) return [];
    const state = this.state;
    const out: Outbound[] = this.seats.liveConnections().map(({ seat }) => ({
      kind: 'to-seat' as const,
      seat,
      message: {
        type: 'update' as const,
        view: clientView(state, seat),
        events: redactEventsFor(state, events, seat),
        ...(record ? { retrospective: record } : {}),
      },
    }));
    if (this.tableHosted) {
      out.push({
        kind: 'to-table',
        message: {
          type: 'table-update',
          view: tableView(state),
          events: redactEventsFor(state, events, null),
          ...(record ? { retrospective: record } : {}),
        },
      });
    }
    return out;
  }

  /**
   * The end-of-game record (#68, #69), rebuilt here because here is where the
   * authoritative command log lives. It goes out **unredacted and identical to
   * every seat**, which is the one moment that is right: settlement already
   * publishes every seat's cash and holdings, so the disclosure costs nothing
   * — and a per-seat record would hand a closed table a different history each,
   * which is the bug #60 closed rather than a feature.
   *
   * A log that will not replay comes back `complete: false` and the end screen
   * falls back to the standings. Nothing here throws: this runs inside the
   * PartyKit lifecycle, where a throw takes the room with it.
   */
  private async endRecord(): Promise<Retrospective | undefined> {
    try {
      const base = createGame(setupOptionsFor(this.config, this.seats.displayNames()));
      return retrospective(base, await this.log.loadAll());
    } catch (error) {
      roomWarn(this.code, 'could not build the end-of-game record', { error: String(error) });
      return undefined;
    }
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
