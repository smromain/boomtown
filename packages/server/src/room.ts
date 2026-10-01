import { Server, getServerByName, type Connection, type ConnectionContext, type WSMessage } from 'partyserver';
import type { RoomMessage } from '@boomtown/protocol';
import { PROTOCOL_VERSION, isRoomAddress, mintTicket, parseClientMessage, protocolError } from '@boomtown/protocol';
import type { Seat } from '@boomtown/engine';
import { GameRoom, type Outbound } from './game-room.js';
import { roomLog, roomWarn } from './log.js';
import { LIMITS, RoomGuards } from './limits.js';
import { mintToken } from './tokens.js';
import { LIFECYCLE, isIdle, lastActivity, purge, touch, type AlarmStore } from './lifecycle.js';
import type { KeyValueStore } from './storage.js';
import { configError, humanlessRoom } from './seats.js';
import { TICKET_RENEW_LEAD_MS } from './directory.js';
import type { Env } from './env.js';

/**
 * What a connection keeps in its persisted per-connection state, which
 * survives hibernation: a seat and its token, or the couch table's token (#62).
 */
type ConnectionState =
  | { readonly seat: Seat; readonly token: string; readonly name?: string }
  | { readonly table: true; readonly token: string };

/** The display name a client put in its socket URL, blank when it gave none. */
function nameOf(connection: Connection): string {
  return connection.uri ? (new URL(connection.uri).searchParams.get('name') ?? '') : '';
}

/**
 * The Durable Object adapter, on Cloudflare's `partyserver`. One instance per
 * room (`this.name` is the room address). All game logic lives in `GameRoom`;
 * this class only wires the object's `storage`, connections, and lifecycle into
 * it (KTD6). It is verified by `wrangler dev` and the integration test, not by
 * unit tests.
 */
export default class BoomtownRoom extends Server<Env> {
  /** Hibernate between messages; `onStart` replays the command log on wake (KTD13). */
  static override options = { hibernate: true };

  private game: GameRoom | null = null;
  /** seat <- connection id, mirrored here so onClose can find the seat fast. */
  private readonly seatByConnection = new Map<string, Seat>();
  /** Per-connection rate limits and strike counts (`limits.ts`). */
  private readonly guards = new RoomGuards();
  /**
   * The cap on how long bots wait for a paced table (#62). A table mid-beat, or
   * one that stopped answering, delays a bot move by at most this long.
   */
  private botTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Runs on cold start and on wake from hibernation. Rebuild the game from the
   * command log (KTD13, R7), and rebuild the seat<-connection map from each
   * live connection's persisted state — `this.seatByConnection` is in-memory
   * and does not survive hibernation, but `connection.setState` does.
   */
  override async onStart(): Promise<void> {
    const store = this.ctx.storage as unknown as KeyValueStore;
    const live = new Set([...this.getConnections()].map((connection) => connection.id));
    this.game = await GameRoom.rehydrate(this.name, store, live);
    roomLog(this.name, 'onStart', {
      rehydrated: this.game !== null,
      connections: [...this.getConnections()].length,
    });
    this.seatByConnection.clear();
    for (const connection of this.getConnections<ConnectionState>()) {
      const state = connection.state;
      if (state && 'table' in state && state.table === true && typeof state.token === 'string') {
        this.game?.restoreTable(state.token, connection.id);
        continue;
      }
      if (state && 'seat' in state && typeof state.seat === 'number' && typeof state.token === 'string') {
        if (this.game && !this.game.restoreSeat(state.seat, state.token, state.name ?? '', connection.id)) {
          // Storage says this seat is held by another token: the socket was
          // left behind by a phone that has since come back. Let it go.
          roomLog(this.name, 'closing a connection whose seat moved on while the room slept', {
            seat: state.seat,
            connection: connection.id,
          });
          connection.setState(null);
          connection.close();
          continue;
        }
        this.seatByConnection.set(connection.id, state.seat);
      }
    }
    // If the wake resumed bot turns, deliver those updates to the live seats.
    if (this.game && this.game.pendingWakeUpdates.length > 0) {
      const updates = this.game.pendingWakeUpdates;
      this.game.pendingWakeUpdates = [];
      roomLog(this.name, 'dispatching bot updates produced during the wake', { count: updates.length });
      this.dispatch(updates);
    }
  }

  override async onConnect(connection: Connection, ctx: ConnectionContext): Promise<void> {
    const url = new URL(ctx.request.url);
    const token = url.searchParams.get('token') ?? undefined;
    const protocolVersion = url.searchParams.get('v') ?? '0';
    roomLog(this.name, 'onConnect', {
      connection: connection.id,
      protocolVersion,
      hasToken: Boolean(token),
      name: url.searchParams.get('name') ?? null,
      gameExists: this.game !== null,
    });

    // Cap concurrent connections before anything else looks at this one. Seats
    // are capped by the ruleset; this bounds the sockets a room will hold open
    // for reconnect overlap, so a room cannot be held open by strangers.
    const live = [...this.getConnections()].length;
    if (live > LIMITS.maxConnections) {
      roomWarn(this.name, 'refused a connection — room at its connection cap', {
        connection: connection.id,
        live,
        cap: LIMITS.maxConnections,
      });
      this.sendTo(connection, {
        type: 'error',
        error: protocolError('room-full', 'this room has too many connections'),
      });
      connection.close();
      return;
    }

    // Version-gate every connection, not just reconnects — a fresh joiner with
    // a stale protocol version must be turned away before it can create or
    // join a room it cannot parse.
    const versionError = protocolVersion === PROTOCOL_VERSION
      ? null
      : protocolError('wrong-version', `room speaks protocol ${PROTOCOL_VERSION}, client sent ${protocolVersion}`);
    if (versionError) {
      roomWarn(this.name, 'refused a connection on protocol version', {
        connection: connection.id,
        clientVersion: protocolVersion,
        roomVersion: PROTOCOL_VERSION,
      });
      this.sendTo(connection, { type: 'error', error: versionError });
      connection.close();
      return;
    }

    // The couch table coming back (#62). Tried before the seats: the two token
    // spaces never overlap, and the table is the one connection that must
    // never be mistaken for a player.
    if (this.game && token) {
      const previous = this.game.tableConnection();
      const rotated = await this.game.reconnectTable(token, connection.id);
      if (rotated) {
        roomLog(this.name, 'reconnected the table by token', { connection: connection.id });
        // A socket the table left behind (a sleeping laptop's) still carries
        // the old token in its state. Close it, so a wake cannot re-bind it.
        const stale = previous && previous !== connection.id ? this.getConnection(previous) : undefined;
        if (stale) {
          stale.setState(null);
          stale.close();
        }
        connection.setState({ table: true, token: rotated } satisfies ConnectionState);
        this.sendTo(connection, { type: 'table-welcome', token: rotated });
        const view = this.game.currentTableUpdate();
        if (view) this.sendTo(connection, view);
        this.broadcastRoomState();
        // Anything parked for the old connection's pace plays now; the new
        // one is waited on only once it asks to be.
        await this.playBots();
        return;
      }
    }

    // A reconnect: the room already exists and the token matches a seat.
    if (this.game && token) {
      const bound = this.game.reconnect(token, connection.id);
      if (bound) {
        const name = url.searchParams.get('name') ?? '';
        roomLog(this.name, 'reconnected a seat by token', { seat: bound.seat, connection: connection.id });
        // A socket the seat left behind — a phone that went to sleep, or a page
        // that was refreshed — still carries the spent token in its state, and
        // the room may not have seen it close. Left open, a hibernation wake
        // restores the seat from whichever connection it reads last, which can
        // be the stale one: the seat goes back to the spent token, and the
        // phone holding the live one is refused on its next reconnect. Close
        // them, exactly as the table does.
        for (const other of this.getConnections<ConnectionState>()) {
          if (other.id === connection.id) continue;
          const state = other.state;
          const claims = this.seatByConnection.get(other.id) === bound.seat ||
            (state != null && 'seat' in state && state.seat === bound.seat);
          if (!claims) continue;
          roomLog(this.name, 'closing a stale connection for a reconnected seat', { seat: bound.seat, connection: other.id });
          this.seatByConnection.delete(other.id);
          other.setState(null);
          other.close();
        }
        this.seatByConnection.set(connection.id, bound.seat);
        await this.game.persistLobby();
        // The token rotated on use: persist and return the new one, never the
        // one that was presented. Sending back the old token would keep a
        // captured credential alive for the rest of the game.
        connection.setState({ seat: bound.seat, token: bound.token, name });
        this.sendTo(connection, { type: 'welcome', seat: bound.seat, token: bound.token });
        const view = this.game.currentUpdateFor(bound.seat);
        if (view) this.sendTo(connection, view);
        this.broadcastRoomState();
        return;
      }
    }
    // Otherwise wait for an explicit hello / create-room / join in onMessage.
    await this.touchRoom();
  }

  /**
   * The idle alarm fired. If nothing has happened since it was armed, delete
   * everything this room holds; otherwise re-arm for the remaining time — a
   * message that arrived after the alarm was set has already moved the
   * deadline, and `setAlarm` only holds one.
   */
  override async onAlarm(): Promise<void> {
    const store = this.ctx.storage as unknown as KeyValueStore;
    const now = Date.now();
    const last = await lastActivity(store);
    if (!isIdle(last, now)) {
      // The alarm is shared: it may have fired to renew the ticket rather than
      // to expire the room.
      await this.keepTicket();
      await this.armAlarm((last ?? now) + LIFECYCLE.idleExpiryMs);
      return;
    }
    const deleted = await purge(store);
    this.game = null;
    this.seatByConnection.clear();
    roomLog(this.name, 'expired an idle room and deleted its storage', {
      keys: deleted,
      idleMs: last === null ? null : now - last,
    });
  }

  override async onMessage(sender: Connection, raw: WSMessage): Promise<void> {
    // Nothing reaches the game without passing the boundary check first — see
    // `@boomtown/protocol`'s `parseClientMessage`. A connection that keeps
    // sending refuse-able frames is not a client having a bad day, and is
    // dropped rather than answered indefinitely.
    const parsed = parseClientMessage(raw);
    if (!parsed.ok) {
      const guard = this.guards.for(sender.id);
      const exhausted = guard.recordFailure();
      roomWarn(this.name, 'rejected a malformed frame', {
        connection: sender.id,
        code: parsed.error.code,
        reason: parsed.error.message,
        failures: guard.failureCount(),
      });
      this.sendTo(sender, { type: 'error', error: parsed.error });
      if (exhausted) {
        roomWarn(this.name, 'closing a connection on repeated malformed frames', {
          connection: sender.id,
          limit: LIMITS.maxValidationFailures,
        });
        sender.close();
      }
      return;
    }
    const message = parsed.message;
    // Every accepted frame pushes the expiry deadline out (`lifecycle.ts`), so
    // a room in play never ages out and an abandoned one always does.
    await this.touchRoom();

    switch (message.type) {
      case 'hello':
        // A hello with a token but no live game yet: nothing to reconnect to.
        this.sendTo(sender, { type: 'error', error: protocolError('not-in-room', 'send create-room or join') });
        return;

      case 'create-room': {
        roomLog(this.name, 'create-room', { connection: sender.id, config: message.config });
        if (this.game) {
          roomWarn(this.name, 'create-room refused — the room already exists');
          this.sendTo(sender, { type: 'error', error: protocolError('game-not-started', 'room already exists') });
          return;
        }
        // A room is addressed by 160 bits of entropy the creator minted, not by
        // anything a person typed. Refusing anything else is what stops a room
        // being created at a guessable id and then waited at.
        if (!isRoomAddress(this.name)) {
          roomWarn(this.name, 'create-room refused — not a room address');
          this.sendTo(sender, {
            type: 'error',
            error: protocolError('not-in-room', 'rooms are addressed by a generated id'),
          });
          sender.close();
          return;
        }
        // Rule checks on the config happen here as well as at `start`, because
        // a config that can never start should not cost a ticket and a room
        // first. The all-bot table is the one that matters: nothing would be
        // wrong until the creator was refused a seat in their own room.
        const bad =
          configError(message.config) ??
          (humanlessRoom(message.config) ? 'an online room needs at least one seat left for a person' : null);
        if (bad) {
          roomWarn(this.name, 'create-room refused — bad config', { reason: bad, config: message.config });
          this.sendTo(sender, { type: 'error', error: protocolError('malformed-message', bad) });
          return;
        }
        this.game = new GameRoom(this.name, message.config, this.ctx.storage as unknown as KeyValueStore);
        await this.game.persistConfig();
        this.setTicket(await this.claimTicket());
        await this.armAlarm();
        // Couch mode (#62): the creator is the table. It takes no seat — every
        // seat is filled by a phone knocking — and hosts in its own right.
        if (message.table) {
          const tableToken = await this.game.becomeTable(sender.id);
          sender.setState({ table: true, token: tableToken } satisfies ConnectionState);
          this.sendTo(sender, { type: 'table-welcome', token: tableToken });
          this.broadcastRoomState();
          return;
        }
        // The creator is the host, and takes the first seat without knocking —
        // there is nobody to admit them. Whichever seat that turns out to be
        // (seat 0 may be configured as a bot) is persisted as the host seat.
        const seated = await this.seatSender(sender);
        if (seated !== null) {
          this.game.hostSeat = seated;
          await this.game.persistLobby();
        }
        return;
      }

      case 'knock': {
        if (!this.game) {
          this.sendTo(sender, { type: 'error', error: protocolError('not-in-room', 'no such room') });
          return;
        }
        // The table is the room's host, not a player; a knock from it would
        // end with the shared screen holding a hand.
        if (this.isTableConnection(sender)) {
          this.sendTo(sender, { type: 'error', error: protocolError('not-in-room', 'the table cannot take a seat') });
          return;
        }
        const name = nameOf(sender);
        const knock = this.game.door.knock(sender.id, name, Date.now());
        if (!knock) {
          roomWarn(this.name, 'knock refused', { connection: sender.id, locked: this.game.door.locked });
          this.sendTo(sender, {
            type: 'error',
            error: this.game.door.locked
              ? protocolError('room-locked', 'this room is not accepting anyone else')
              : protocolError('knock-declined', 'the host turned you away'),
          });
          sender.close();
          return;
        }
        await this.game.persistLobby();
        roomLog(this.name, 'someone knocked', { knock: knock.id, name: knock.name });
        this.sendTo(sender, { type: 'waiting' });
        this.broadcastRoomState();
        return;
      }

      case 'admit':
      case 'decline': {
        if (!this.requireHost(sender)) return;
        const knock =
          message.type === 'admit'
            ? this.game!.door.take(message.knockId, Date.now())
            : this.game!.door.decline(message.knockId, Date.now());
        if (!knock) {
          this.sendTo(sender, {
            type: 'error',
            error: protocolError('unknown-knock', 'that knock is no longer waiting'),
          });
          return;
        }
        await this.game!.persistLobby();
        const waiting = this.getConnection(knock.connectionId);
        if (message.type === 'decline') {
          roomLog(this.name, 'host declined a knock', { knock: knock.id });
          if (waiting) {
            this.sendTo(waiting, {
              type: 'error',
              error: protocolError('knock-declined', 'the host turned you away'),
            });
            waiting.close();
          }
          this.broadcastRoomState();
          return;
        }
        if (!waiting) {
          roomWarn(this.name, 'admitted a knock whose connection had gone', { knock: knock.id });
          this.broadcastRoomState();
          return;
        }
        roomLog(this.name, 'host admitted a knock', { knock: knock.id, name: knock.name });
        await this.seatSender(waiting);
        return;
      }

      case 'eject': {
        if (!this.requireHost(sender)) return;
        if (message.seat === this.game!.hostSeat) {
          // A host ejecting themselves would leave the room with nobody able to
          // admit, unlock or eject, and no way to appoint anyone.
          this.sendTo(sender, {
            type: 'error',
            error: protocolError('not-host', 'the host cannot remove their own seat'),
          });
          return;
        }
        const updates = await this.game!.ejectSeat(message.seat);
        if (updates === null) {
          this.sendTo(sender, {
            type: 'error',
            error: protocolError('unknown-knock', 'nobody is sitting there'),
          });
          return;
        }
        // Close the ejected player's socket: their token is gone with the seat,
        // so leaving it open would only produce refusals they cannot act on.
        for (const [connId, seat] of this.seatByConnection) {
          if (seat !== message.seat) continue;
          const conn = this.getConnection(connId);
          this.seatByConnection.delete(connId);
          if (conn) {
            this.sendTo(conn, {
              type: 'error',
              error: protocolError('knock-declined', 'the host removed you from the table'),
            });
            conn.close();
          }
        }
        this.dispatch(updates);
        this.broadcastRoomState();
        this.armBotCap();
        return;
      }

      case 'set-locked': {
        if (!this.requireHost(sender)) return;
        await this.game!.setLocked(message.locked);
        // Opening the door again in the lobby wants a code that works, and the
        // old one may have lapsed while it was shut.
        if (!message.locked) await this.keepTicket();
        await this.armAlarm();
        roomLog(this.name, 'host set the door', { locked: message.locked });
        this.broadcastRoomState();
        return;
      }

      case 'start': {
        roomLog(this.name, 'start', { connection: sender.id, gameExists: this.game !== null });
        if (!this.game) {
          roomWarn(this.name, 'start ignored — no game in this room');
          return;
        }
        // Only the host starts: the lobby never offered anyone else the
        // control, and at a couch table the table is the only thing that should.
        if (!this.requireHost(sender)) return;
        const result = await this.game.start();
        if ('error' in result) {
          roomWarn(this.name, 'start refused', { error: result.error });
          this.sendTo(sender, { type: 'error', error: result.error });
          return;
        }
        roomLog(this.name, 'game started', { updates: result.updates.length });
        this.dispatch(result.updates);
        this.armBotCap();
        return;
      }

      case 'pace': {
        if (!this.game || !this.isTableConnection(sender)) {
          this.sendTo(sender, { type: 'error', error: protocolError('not-host', 'only the table sets the pace') });
          return;
        }
        this.game.tablePace(message.holding);
        if (message.holding) {
          this.armBotCap();
          return;
        }
        await this.playBots();
        return;
      }

      case 'command': {
        if (!this.game) return;
        // Rate-limited before the seat lookup: an unseated flooder should cost
        // the room a bucket check, not a map scan and an engine call.
        if (!this.guards.for(sender.id).commands.take()) {
          roomWarn(this.name, 'rate-limited a command', {
            connection: sender.id,
            perSecond: LIMITS.commandsPerSecond,
          });
          this.sendTo(sender, {
            type: 'error',
            error: protocolError('rate-limited', 'too many commands — slow down'),
          });
          return;
        }
        const seat = this.seatByConnection.get(sender.id) ?? this.seatFromState(sender);
        if (seat === undefined) {
          roomWarn(this.name, 'command from a connection with no seat', {
            connection: sender.id,
            command: message.command.type,
          });
          this.sendTo(sender, { type: 'error', error: protocolError('not-in-room', 'no seat on this connection') });
          return;
        }
        const updates = await this.game.command(seat, message.command);
        this.dispatch(updates);
        this.armBotCap();
        return;
      }
    }
  }

  override async onClose(connection: Connection): Promise<void> {
    roomLog(this.name, 'onClose', {
      connection: connection.id,
      seat: this.seatByConnection.get(connection.id) ?? null,
    });
    const wasTable = this.game?.isTable(connection.id) ?? false;
    this.seatByConnection.delete(connection.id);
    this.guards.release(connection.id);
    if (this.game?.door.dropConnection(connection.id)) await this.game.persistLobby();
    this.game?.markDisconnected(connection.id);
    this.broadcastRoomState();
    // A table that walks away mid-beat takes its pacing with it: the bots it
    // was holding play on for the phones.
    if (wasTable) await this.playBots();
  }

  // --- pacing bots to the table (#62, U38) --------------------------------

  /** Play whatever the bots may play now, send it, and re-arm the cap. */
  private async playBots(force = false): Promise<void> {
    if (!this.game) return;
    this.clearBotCap();
    this.dispatch(await this.game.stepBots(force));
    this.armBotCap();
  }

  /**
   * While a paced table holds a bot back, make sure it is held for at most
   * `LIMITS.tableHoldMs`. Re-armed on every pace and every move, so the cap is
   * per wait, not per game.
   */
  private armBotCap(): void {
    this.clearBotCap();
    if (!this.game?.isPaced() || !this.game.botWaiting()) return;
    this.botTimer = setTimeout(() => {
      this.botTimer = null;
      roomWarn(this.name, 'the table held a bot past the cap — playing on', { capMs: LIMITS.tableHoldMs });
      void this.playBots(true);
    }, LIMITS.tableHoldMs);
  }

  private clearBotCap(): void {
    if (this.botTimer !== null) clearTimeout(this.botTimer);
    this.botTimer = null;
  }

  // --- helpers --------------------------------------------------------

  /** Recover a seat from persisted connection state (after a hibernation wake). */
  private seatFromState(connection: Connection): Seat | undefined {
    const state = connection.state as { seat?: Seat; token?: string; name?: string } | null;
    if (!state || typeof state.seat !== 'number' || typeof state.token !== 'string') return undefined;
    if (!this.game?.restoreSeat(state.seat, state.token, state.name ?? '', connection.id)) return undefined;
    this.seatByConnection.set(connection.id, state.seat);
    return state.seat;
  }

  private async seatSender(sender: Connection): Promise<number | null> {
    if (!this.game) return null;
    // Blank rather than an invented default: `SeatTable` owns what a nameless
    // seat is called, so there is one rule instead of three edges guessing.
    const name = nameOf(sender);
    const token = mintToken();
    const bound = this.game.join(name, token, sender.id);
    if (!bound) {
      roomWarn(this.name, 'join refused — room full', { connection: sender.id, name });
      this.sendTo(sender, { type: 'error', error: protocolError('room-full', 'all seats are taken') });
      sender.close();
      return null;
    }
    this.seatByConnection.set(sender.id, bound.seat);
    this.game.door.dropConnection(sender.id);
    // Durable before the welcome goes out: a seat that exists only in memory is
    // gone the next time the room sleeps, and its token with it.
    await this.game.persistLobby();
    sender.setState({ seat: bound.seat, token, name });
    roomLog(this.name, 'seated a player', { seat: bound.seat, name, connection: sender.id });
    this.sendTo(sender, { type: 'welcome', seat: bound.seat, token });
    // A ticket that has done its job stops being a way in at all, rather than
    // idling until its TTL. Nobody else can be seated here anyway — unless bots
    // are only holding seats at a closed door, which opening it gives back.
    if (this.game.seats.allSeatsFilled() && this.game.seats.filledSeats().length === 0) void this.retireTicket();
    this.broadcastRoomState();
    return bound.seat;
  }

  /**
   * Room state, sent per connection rather than broadcast, because one field
   * differs by recipient: only the host is told who is knocking. Sending the
   * queue to everyone would turn the lobby into a way to watch who is trying to
   * get into a room you are already in.
   */
  private broadcastRoomState(): void {
    if (!this.game) return;
    const forGuests = this.game.roomState();
    const forHost = this.game.roomState(this.game.door.list(Date.now()));
    roomLog(this.name, 'send room-state', {
      phase: forGuests.phase,
      knocks: forHost.knocks.length,
      locked: forGuests.locked,
      seats: forGuests.seats.map((s) => `${s.index}:${s.kind}${s.connected ? '' : ' (off)'}`),
    });
    for (const connection of this.getConnections()) {
      this.sendTo(connection, { type: 'room-state', state: this.isHost(connection) ? forHost : forGuests });
    }
  }

  private dispatch(updates: Outbound[]): void {
    for (const out of updates) {
      if (out.kind === 'broadcast') {
        this.broadcast(JSON.stringify(out.message));
        continue;
      }
      if (out.kind === 'to-table') {
        // A table that is away misses nothing it cannot get back: a reconnect
        // is sent the current table view.
        const id = this.game?.tableConnection();
        const conn = id ? this.getConnection(id) : undefined;
        if (conn) this.sendTo(conn, out.message);
        continue;
      }
      // to-seat: find every connection bound to that seat
      let delivered = 0;
      for (const [connId, seat] of this.seatByConnection) {
        if (seat !== out.seat) continue;
        const conn = this.getConnection(connId);
        if (conn) {
          this.sendTo(conn, out.message);
          delivered += 1;
        }
      }
      if (delivered === 0 && out.message.type !== 'update') {
        roomWarn(this.name, 'nothing delivered for a to-seat message', {
          seat: out.seat,
          type: out.message.type,
        });
      }
    }
  }

  /** The object's alarm handle, when the runtime provides one. */
  private alarms(): AlarmStore | null {
    const storage = this.ctx.storage as unknown as Partial<AlarmStore>;
    return typeof storage.setAlarm === 'function' ? (storage as AlarmStore) : null;
  }

  private async touchRoom(): Promise<void> {
    const now = Date.now();
    await touch(this.ctx.storage as unknown as KeyValueStore, this.alarms(), now);
    await this.armAlarm(now + LIFECYCLE.idleExpiryMs);
  }

  /**
   * Point the room's one alarm at whichever comes first: the idle deadline, or
   * — while the lobby still wants people — the moment the ticket needs
   * renewing. Without the second, a table left waiting showed a QR code that
   * had silently stopped working fifteen minutes after it opened.
   */
  private async armAlarm(idleAt?: number): Promise<void> {
    const alarms = this.alarms();
    if (!alarms) return;
    const deadline =
      idleAt ??
      ((await lastActivity(this.ctx.storage as unknown as KeyValueStore)) ?? Date.now()) + LIFECYCLE.idleExpiryMs;
    const renewAt =
      this.game?.wantsTicket() && this.game.ticketExpiresAt !== null
        ? this.game.ticketExpiresAt - TICKET_RENEW_LEAD_MS
        : null;
    await alarms.setAlarm(renewAt !== null && renewAt < deadline ? Math.max(renewAt, Date.now()) : deadline);
  }

  /**
   * Keep the code on screen working while the lobby wants people and someone
   * is here to see it. Re-claims the same ticket, which the directory extends
   * because it already points here; only if that fails is a new one minted and
   * the screen told.
   */
  private async keepTicket(): Promise<void> {
    const game = this.game;
    if (!game?.wantsTicket()) return;
    if ([...this.getConnections()].length === 0) return;
    const due = game.ticket === null || game.ticketExpiresAt === null ||
      Date.now() >= game.ticketExpiresAt - TICKET_RENEW_LEAD_MS;
    if (!due) return;
    const before = game.ticket;
    const claimed = await this.claimTicket(before);
    if (!claimed) return;
    this.setTicket(claimed);
    await game.persistLobby();
    roomLog(this.name, claimed.ticket === before ? 'renewed the ticket' : 'replaced the ticket', {
      expiresAt: claimed.expiresAt,
    });
    if (claimed.ticket !== before) this.broadcastRoomState();
  }

  private setTicket(claimed: { ticket: string; expiresAt: number } | null): void {
    if (!this.game) return;
    this.game.ticket = claimed?.ticket ?? null;
    this.game.ticketExpiresAt = claimed?.expiresAt ?? null;
  }

  /**
   * Ask the directory for a ticket pointing at this room. Retries on the
   * vanishingly unlikely collision with a live ticket; gives up quietly rather
   * than failing room creation, because a room with no ticket is still
   * perfectly playable by anyone holding its address.
   */
  private async claimTicket(renew: string | null = null): Promise<{ ticket: string; expiresAt: number } | null> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      // The first try at a renewal is the ticket already on screen; the
      // directory extends it because it already points at this room.
      const ticket = attempt === 0 && renew ? renew : mintTicket();
      try {
        const response = await this.directory(ticket, {
          method: 'POST',
          body: JSON.stringify({ address: this.name }),
        });
        if (response.ok) {
          const { expiresAt } = (await response.json()) as { expiresAt: number };
          roomLog(this.name, 'claimed a ticket', { attempt: attempt + 1 });
          return { ticket, expiresAt };
        }
      } catch (error) {
        roomWarn(this.name, 'ticket claim failed', { error: String(error) });
        return null;
      }
    }
    roomWarn(this.name, 'could not claim a ticket in three attempts');
    return null;
  }

  private async retireTicket(): Promise<void> {
    const ticket = this.game?.ticket;
    if (!ticket) return;
    if (this.game) {
      this.setTicket(null);
      await this.game.persistLobby();
    }
    try {
      await this.directory(ticket, { method: 'DELETE' });
      roomLog(this.name, 'retired the ticket — every seat is taken');
    } catch (error) {
      roomWarn(this.name, 'ticket retire failed', { error: String(error) });
    }
  }

  /** A request to the directory object for one ticket, object to object. */
  private async directory(ticket: string, init: RequestInit): Promise<Response> {
    const stub = await getServerByName(this.env.Directory, ticket);
    return stub.fetch(new Request(`https://directory/parties/directory/${ticket}`, init));
  }

  /**
   * Whether this connection is the couch table (#62). The in-memory binding
   * first; after a wake, the connection's persisted state, which is re-bound so
   * the next check is a comparison again.
   */
  private isTableConnection(connection: Connection): boolean {
    if (!this.game?.tableHosted) return false;
    if (this.game.isTable(connection.id)) return true;
    const state = connection.state as Partial<{ table: true; token: string }> | null;
    if (state?.table === true && typeof state.token === 'string') {
      this.game.restoreTable(state.token, connection.id);
      return this.game.isTable(connection.id);
    }
    return false;
  }

  /**
   * Whether this connection holds host authority: the table at a couch table,
   * the host seat otherwise. Never both — a table-hosted room has no host seat.
   */
  private isHost(connection: Connection): boolean {
    if (!this.game) return false;
    if (this.game.tableHosted) return this.isTableConnection(connection);
    const seat = this.seatByConnection.get(connection.id) ?? this.seatFromState(connection);
    return seat !== undefined && seat === this.game.hostSeat;
  }

  /**
   * Only the host may admit, decline, lock, eject or start. Anyone else asking
   * is told plainly rather than ignored — a client that thinks it is the host
   * is a bug worth seeing, not a silence to debug later.
   */
  private requireHost(sender: Connection): boolean {
    if (!this.game) {
      this.sendTo(sender, { type: 'error', error: protocolError('not-in-room', 'no such room') });
      return false;
    }
    if (!this.isHost(sender)) {
      roomWarn(this.name, 'refused a host-only message', {
        connection: sender.id,
        seat: this.seatByConnection.get(sender.id) ?? null,
        hostSeat: this.game.hostSeat,
        table: this.game.tableHosted,
      });
      this.sendTo(sender, {
        type: 'error',
        error: protocolError('not-host', 'only the player who made the room can do that'),
      });
      return false;
    }
    return true;
  }

  private sendTo(connection: Connection, message: RoomMessage): void {
    connection.send(JSON.stringify(message));
  }
}
