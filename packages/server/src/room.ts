import type * as Party from 'partykit/server';
import type { ClientMessage, RoomMessage } from '@boomtown/protocol';
import { PROTOCOL_VERSION, protocolError } from '@boomtown/protocol';
import type { Seat } from '@boomtown/engine';
import { GameRoom, type Outbound } from './game-room.js';
import { roomLog, roomWarn } from './log.js';
import type { KeyValueStore } from './storage.js';

/**
 * The PartyKit adapter. One instance per room (`room.id` is the room code).
 * All game logic lives in `GameRoom`; this class only wires PartyKit's
 * `storage`, connections, and lifecycle into it (KTD6). It is verified by
 * `partykit dev` and the integration test, not by unit tests.
 */
export default class BoomtownRoom implements Party.Server {
  /** Hibernate between messages; `onStart` replays the command log on wake (KTD13). */
  readonly options = { hibernate: true };

  private game: GameRoom | null = null;
  /** seat <- connection id, mirrored here so onClose can find the seat fast. */
  private readonly seatByConnection = new Map<string, Seat>();

  constructor(readonly room: Party.Room) {}

  /**
   * Runs on cold start and on wake from hibernation. Rebuild the game from the
   * command log (KTD13, R7), and rebuild the seat<-connection map from each
   * live connection's persisted state — `this.seatByConnection` is in-memory
   * and does not survive hibernation, but `connection.setState` does.
   */
  async onStart(): Promise<void> {
    const store = this.room.storage as unknown as KeyValueStore;
    this.game = await GameRoom.rehydrate(this.room.id, store);
    roomLog(this.room.id, 'onStart', {
      rehydrated: this.game !== null,
      connections: [...this.room.getConnections()].length,
    });
    this.seatByConnection.clear();
    for (const connection of this.room.getConnections<{ seat: Seat; token: string; name?: string }>()) {
      const state = connection.state;
      if (state && typeof state.seat === 'number' && typeof state.token === 'string') {
        this.seatByConnection.set(connection.id, state.seat);
        this.game?.restoreSeat(state.seat, state.token, state.name ?? 'Player', connection.id);
      }
    }
    // If the wake resumed bot turns, deliver those updates to the live seats.
    if (this.game && this.game.pendingWakeUpdates.length > 0) {
      const updates = this.game.pendingWakeUpdates;
      this.game.pendingWakeUpdates = [];
      roomLog(this.room.id, 'dispatching bot updates produced during the wake', { count: updates.length });
      this.dispatch(updates);
    }
  }

  async onConnect(connection: Party.Connection, ctx: Party.ConnectionContext): Promise<void> {
    const url = new URL(ctx.request.url);
    const token = url.searchParams.get('token') ?? undefined;
    const protocolVersion = url.searchParams.get('v') ?? '0';
    roomLog(this.room.id, 'onConnect', {
      connection: connection.id,
      protocolVersion,
      hasToken: Boolean(token),
      name: url.searchParams.get('name') ?? null,
      gameExists: this.game !== null,
    });

    // Version-gate every connection, not just reconnects — a fresh joiner with
    // a stale protocol version must be turned away before it can create or
    // join a room it cannot parse.
    const versionError = protocolVersion === PROTOCOL_VERSION
      ? null
      : protocolError('wrong-version', `room speaks protocol ${PROTOCOL_VERSION}, client sent ${protocolVersion}`);
    if (versionError) {
      roomWarn(this.room.id, 'refused a connection on protocol version', {
        connection: connection.id,
        clientVersion: protocolVersion,
        roomVersion: PROTOCOL_VERSION,
      });
      this.sendTo(connection, { type: 'error', error: versionError });
      connection.close();
      return;
    }

    // A reconnect: the room already exists and the token matches a seat.
    if (this.game && token) {
      const bound = this.game.reconnect(token, connection.id);
      if (bound) {
        const name = url.searchParams.get('name') ?? 'Player';
        roomLog(this.room.id, 'reconnected a seat by token', { seat: bound.seat, connection: connection.id });
        this.seatByConnection.set(connection.id, bound.seat);
        connection.setState({ seat: bound.seat, token, name });
        this.sendTo(connection, { type: 'welcome', seat: bound.seat, token });
        const view = this.game.currentUpdateFor(bound.seat);
        if (view) this.sendTo(connection, view);
        this.broadcastRoomState();
        return;
      }
    }
    // Otherwise wait for an explicit hello / create-room / join in onMessage.
  }

  async onMessage(raw: string | ArrayBuffer | ArrayBufferView, sender: Party.Connection): Promise<void> {
    let message: ClientMessage;
    try {
      const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw as ArrayBuffer);
      message = JSON.parse(text) as ClientMessage;
    } catch {
      this.sendTo(sender, { type: 'error', error: protocolError('malformed-message', 'not JSON') });
      return;
    }

    switch (message.type) {
      case 'hello':
        // A hello with a token but no live game yet: nothing to reconnect to.
        this.sendTo(sender, { type: 'error', error: protocolError('not-in-room', 'send create-room or join') });
        return;

      case 'create-room': {
        roomLog(this.room.id, 'create-room', { connection: sender.id, config: message.config });
        if (this.game) {
          roomWarn(this.room.id, 'create-room refused — the room already exists');
          this.sendTo(sender, { type: 'error', error: protocolError('game-not-started', 'room already exists') });
          return;
        }
        this.game = new GameRoom(this.room.id, message.config, this.room.storage as unknown as KeyValueStore);
        await this.game.persistConfig();
        this.joinSender(sender);
        return;
      }

      case 'join': {
        roomLog(this.room.id, 'join', { connection: sender.id, gameExists: this.game !== null });
        if (!this.game) {
          roomWarn(this.room.id, 'join refused — no such room');
          this.sendTo(sender, { type: 'error', error: protocolError('not-in-room', 'no such room') });
          return;
        }
        this.joinSender(sender);
        return;
      }

      case 'start': {
        roomLog(this.room.id, 'start', { connection: sender.id, gameExists: this.game !== null });
        if (!this.game) {
          roomWarn(this.room.id, 'start ignored — no game in this room');
          return;
        }
        const result = await this.game.start();
        if ('error' in result) {
          roomWarn(this.room.id, 'start refused', { error: result.error });
          this.sendTo(sender, { type: 'error', error: result.error });
          return;
        }
        roomLog(this.room.id, 'game started', { updates: result.updates.length });
        this.dispatch(result.updates);
        return;
      }

      case 'command': {
        if (!this.game) return;
        const seat = this.seatByConnection.get(sender.id) ?? this.seatFromState(sender);
        if (seat === undefined) {
          roomWarn(this.room.id, 'command from a connection with no seat', {
            connection: sender.id,
            command: message.command.type,
          });
          this.sendTo(sender, { type: 'error', error: protocolError('not-in-room', 'no seat on this connection') });
          return;
        }
        const updates = await this.game.command(seat, message.command);
        this.dispatch(updates);
        return;
      }
    }
  }

  onClose(connection: Party.Connection): void {
    roomLog(this.room.id, 'onClose', {
      connection: connection.id,
      seat: this.seatByConnection.get(connection.id) ?? null,
    });
    this.seatByConnection.delete(connection.id);
    this.game?.markDisconnected(connection.id);
    this.broadcastRoomState();
  }

  // --- helpers --------------------------------------------------------

  /** Recover a seat from persisted connection state (after a hibernation wake). */
  private seatFromState(connection: Party.Connection): Seat | undefined {
    const state = connection.state as { seat?: Seat; token?: string; name?: string } | null;
    if (!state || typeof state.seat !== 'number' || typeof state.token !== 'string') return undefined;
    this.seatByConnection.set(connection.id, state.seat);
    this.game?.restoreSeat(state.seat, state.token, state.name ?? 'Player', connection.id);
    return state.seat;
  }

  private joinSender(sender: Party.Connection): void {
    if (!this.game) return;
    const name = new URL(sender.uri).searchParams.get('name') ?? 'Player';
    const token = crypto.randomUUID();
    const bound = this.game.join(name, token, sender.id);
    if (!bound) {
      roomWarn(this.room.id, 'join refused — room full', { connection: sender.id, name });
      this.sendTo(sender, { type: 'error', error: protocolError('room-full', 'all seats are taken') });
      sender.close();
      return;
    }
    this.seatByConnection.set(sender.id, bound.seat);
    sender.setState({ seat: bound.seat, token, name });
    roomLog(this.room.id, 'seated a player', { seat: bound.seat, name, connection: sender.id });
    this.sendTo(sender, { type: 'welcome', seat: bound.seat, token });
    this.broadcastRoomState();
  }

  private broadcastRoomState(): void {
    if (!this.game) return;
    const state = this.game.roomState();
    roomLog(this.room.id, 'broadcast room-state', {
      phase: state.phase,
      seats: state.seats.map((s) => `${s.index}:${s.kind}${s.connected ? '' : ' (off)'}`),
    });
    this.room.broadcast(JSON.stringify({ type: 'room-state', state } satisfies RoomMessage));
  }

  private dispatch(updates: Outbound[]): void {
    for (const out of updates) {
      if (out.kind === 'broadcast') {
        this.room.broadcast(JSON.stringify(out.message));
        continue;
      }
      // to-seat: find every connection bound to that seat
      let delivered = 0;
      for (const [connId, seat] of this.seatByConnection) {
        if (seat !== out.seat) continue;
        const conn = this.room.getConnection(connId);
        if (conn) {
          this.sendTo(conn, out.message);
          delivered += 1;
        }
      }
      if (delivered === 0 && out.message.type !== 'update') {
        roomWarn(this.room.id, 'nothing delivered for a to-seat message', {
          seat: out.seat,
          type: out.message.type,
        });
      }
    }
  }

  private sendTo(connection: Party.Connection, message: RoomMessage): void {
    connection.send(JSON.stringify(message));
  }
}
