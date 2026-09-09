import PartySocket from 'partysocket';
import type { Command, Seat } from '@boomtown/engine';
import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type RoomConfig,
  type RoomMessage,
  type RoomState,
} from '@boomtown/protocol';
import { netlog, safeJson } from '../netlog.js';
import type { ClientView } from '../view.js';
import type { GameTransport, TransportMessage } from './types.js';

export interface SocketTransportOptions {
  /** The PartyKit host, e.g. `boomtown.you.partykit.dev` or `localhost:1999`. */
  readonly host: string;
  /** The room code. */
  readonly room: string;
  /** This player's display name. */
  readonly name: string;
  /** Present on reconnect-into-a-known-seat; absent on a first join. */
  readonly token?: string;
  /**
   * Sent as the first message after the socket opens. `create` configures a new
   * room; `join` takes an open seat in an existing one; `resume` (with a token)
   * is a reconnect and sends nothing — the room re-binds on the token in the
   * query string.
   */
  readonly intent:
    | { readonly kind: 'create'; readonly config: RoomConfig }
    | { readonly kind: 'join' }
    | { readonly kind: 'resume' };
  /**
   * How long `connect()` waits for the room's `welcome` before giving up.
   * A socket that opens but never answers otherwise leaves the caller awaiting
   * forever, with nothing on screen to explain it.
   */
  readonly connectTimeoutMs?: number;
}

/** A lobby / protocol error that is not tied to a game command. */
export interface LobbyError {
  readonly code: string;
  readonly message: string;
}

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

/** Room-lobby state surfaced to the UI alongside the game view. */
export interface SocketExtras {
  /**
   * Subscribe to room state. The most recent `room-state` (if one has already
   * arrived) is replayed to the new subscriber synchronously — see the note on
   * late subscribers below. Returns an unsubscribe.
   */
  onRoomState(cb: (state: RoomState) => void): () => void;
  /** Subscribe to connection status; the current status is replayed. Returns an unsubscribe. */
  onConnectionChange(cb: (status: ConnectionStatus) => void): () => void;
  /**
   * Fired for every room `error` frame that is not a rejection of an
   * outstanding command — room-full, wrong-version, "no such room", a stuck
   * game. The last such error is replayed to a new subscriber. Returns an
   * unsubscribe.
   */
  onLobbyError(cb: (error: LobbyError) => void): () => void;
  /** The last room state received, or null before the first one. */
  roomState(): RoomState | null;
  /** The current socket status, without waiting for the next change. */
  connectionStatus(): ConnectionStatus;
  /** The seat this client was assigned, once `welcome` arrives. */
  seat(): Seat | null;
  /** The session token, once `welcome` arrives — persist it for reconnects. */
  token(): string | null;
  start(): void;
}

/**
 * `GameTransport` over a PartyKit room (KTD5, KTD6). `partysocket` owns
 * reconnect and backoff; this class translates room messages into the exact
 * `TransportMessage` shape (`{ events, views, rejection? }`) that `reconcile`
 * already consumes — so `client-core` and every panel are identical to local
 * play. Online a client controls exactly one seat, so `views` carries one entry.
 *
 * **Late subscribers get the last value.** The lobby UI cannot subscribe until
 * React has mounted it, which is strictly after `connect()` resolved — and the
 * room sends `welcome` and `room-state` back to back, so the `room-state` frame
 * has almost always been delivered before anyone is listening. Firing it into
 * an empty listener set lost it for good: with one human and two bots nothing
 * else ever joins, so no second broadcast followed and the lobby sat on
 * "Waiting for the room…" with a permanently disabled Start button. The same
 * applies to the `open` status. Both are therefore cached and replayed on
 * subscribe; `onMessage` needs no such treatment because `createGameClient`
 * subscribes before `connect()` is ever called.
 */
export function socketTransport(
  options: SocketTransportOptions,
): GameTransport & SocketExtras {
  const handlers = new Set<(message: TransportMessage) => void>();
  const roomStateHandlers = new Set<(state: RoomState) => void>();
  const connectionHandlers = new Set<(status: ConnectionStatus) => void>();
  const lobbyErrorHandlers = new Set<(error: LobbyError) => void>();

  let socket: PartySocket | null = null;
  let mySeat: Seat | null = null;
  let myToken: string | null = options.token ?? null;
  /** The last room state seen, replayed to late subscribers. */
  let lastRoomState: RoomState | null = null;
  /** The last lobby error seen, replayed to late subscribers. */
  let lastLobbyError: LobbyError | null = null;
  let status: ConnectionStatus = 'connecting';
  /** A command sent but not yet confirmed or rejected. Cleared on any update. */
  let outstandingCommand: Command | null = null;
  /**
   * True once `welcome` has arrived. `partysocket` reconnects transparently and
   * re-fires `open`; without this, the reconnect would re-send `create-room` /
   * `join` and either error or grab a second seat.
   */
  let joined = false;
  /**
   * The pending `connect()` settlers. For a create/join intent `connect()`
   * resolves on `welcome` and rejects on the room's `error`; for a resume it
   * resolves on socket `open`. Cleared once settled.
   */
  let settleConnect: { resolve: () => void; reject: (e: Error) => void } | null = null;
  let connectTimer: ReturnType<typeof setTimeout> | null = null;
  /** How many times the socket has opened — 1 is the first connect, 2+ a reconnect. */
  let opens = 0;

  const log = (
    direction: 'in' | 'out' | 'note' | 'warn',
    label: string,
    detail?: Record<string, unknown>,
  ) => netlog.log('socket', direction, label, detail);

  const settle = (outcome: 'resolve' | 'reject', error?: Error) => {
    if (connectTimer !== null) {
      clearTimeout(connectTimer);
      connectTimer = null;
    }
    const pending = settleConnect;
    settleConnect = null;
    if (!pending) return;
    if (outcome === 'resolve') pending.resolve();
    else pending.reject(error ?? new Error('connect failed'));
  };

  const notifyConnection = (next: ConnectionStatus) => {
    status = next;
    log('note', `connection ${next}`, { subscribers: connectionHandlers.size });
    for (const cb of connectionHandlers) cb(next);
  };

  const send = (message: ClientMessage) => {
    if (!socket) {
      log('warn', 'send with no socket', { type: message.type });
      return;
    }
    log('out', message.type, summariseClient(message));
    socket.send(JSON.stringify(message));
  };

  /** Turn one room `update` into a `TransportMessage` for the single seat we hold. */
  const toTransportMessage = (
    view: ClientView,
    events: TransportMessage['events'],
    rejection?: TransportMessage['rejection'],
  ): TransportMessage => {
    const views: Record<Seat, ClientView> = { [view.you]: view };
    return rejection ? { events: [], views, rejection } : { events, views };
  };

  const onRoomMessage = (message: RoomMessage) => {
    log('in', message.type, summariseRoom(message));
    switch (message.type) {
      case 'welcome':
        mySeat = message.seat;
        myToken = message.token;
        joined = true;
        settle('resolve');
        return;
      case 'room-state':
        lastRoomState = message.state;
        if (roomStateHandlers.size === 0) {
          // Not a failure any more — it is held and replayed on subscribe —
          // but worth seeing in the timeline, because it is exactly the frame
          // whose loss used to strand the lobby.
          log('note', 'room-state held for a later subscriber', { phase: message.state.phase });
        }
        for (const cb of roomStateHandlers) cb(message.state);
        return;
      case 'update': {
        // The room sends a full ClientViewDTO (legalMoves + handTiles computed
        // server-side), so it is exactly the store's ClientView — pass through.
        const view = message.view as ClientView;
        if (message.rejection) {
          outstandingCommand = null;
          for (const h of handlers) {
            h(toTransportMessage(view, [], { command: message.rejection.command, error: mapError(message.rejection.error) }));
          }
        } else {
          // A clean update confirms whatever command was outstanding.
          outstandingCommand = null;
          for (const h of handlers) h(toTransportMessage(view, message.events));
        }
        return;
      }
      case 'error': {
        const err: LobbyError = { code: errorCode(message.error), message: errorText(message.error) };
        if (outstandingCommand) {
          // An error for a command we are actually waiting on.
          const command = outstandingCommand;
          outstandingCommand = null;
          log('warn', 'command rejected', { code: err.code, message: err.message, command: command.type });
          for (const h of handlers) {
            h({ events: [], views: {}, rejection: { command, error: mapError(message.error) } });
          }
        } else if (!joined && settleConnect) {
          // The room rejected our create/join before we ever got a seat.
          log('warn', 'connect rejected by the room', err as unknown as Record<string, unknown>);
          settle('reject', new Error(`${err.code}: ${err.message}`));
        } else {
          // A lobby / room-level error with no command behind it.
          lastLobbyError = err;
          log('warn', 'lobby error', err as unknown as Record<string, unknown>);
          for (const cb of lobbyErrorHandlers) cb(err);
        }
        return;
      }
    }
  };

  return {
    connect: () =>
      new Promise<void>((resolve, reject) => {
        const isResume = options.intent.kind === 'resume';
        log('note', 'connect', {
          host: options.host,
          room: options.room,
          name: options.name,
          intent: options.intent.kind,
          protocolVersion: PROTOCOL_VERSION,
          hasToken: Boolean(myToken),
          ...(options.intent.kind === 'create' ? { config: options.intent.config } : {}),
        });
        notifyConnection('connecting');
        settleConnect = { resolve, reject };
        const timeoutMs = options.connectTimeoutMs ?? 15_000;
        connectTimer = setTimeout(() => {
          log('warn', 'connect timed out', { host: options.host, room: options.room, timeoutMs, opens, joined });
          settle(
            'reject',
            new Error(
              `the room at ${options.host} accepted the socket but never answered (waited ${Math.round(timeoutMs / 1000)}s)`,
            ),
          );
        }, timeoutMs);

        socket = new PartySocket({
          host: options.host,
          room: options.room,
          party: 'main',
          query: () => ({
            v: PROTOCOL_VERSION,
            name: options.name,
            ...(myToken ? { token: myToken } : {}),
          }),
        });

        socket.addEventListener('open', () => {
          opens += 1;
          log('note', opens === 1 ? 'socket open' : 'socket reopened', { opens, joined });
          notifyConnection('open');
          // Only send the create/join once. `partysocket` re-fires `open` on a
          // transparent reconnect; the room re-binds us on the query token then.
          if (!joined) {
            if (options.intent.kind === 'create') {
              send({ type: 'create-room', config: options.intent.config });
            } else if (options.intent.kind === 'join') {
              send({ type: 'join' });
            }
          }
          // Resume: the room re-binds silently on the token, so 'open' is the
          // signal. Create/join wait for 'welcome' (or an 'error') below.
          if (isResume || joined) settle('resolve');
        });

        socket.addEventListener('message', (event) => {
          const raw = String((event as MessageEvent).data);
          try {
            onRoomMessage(JSON.parse(raw) as RoomMessage);
          } catch {
            log('warn', 'unparseable frame', { raw: safeJson(raw, 200) });
          }
        });

        socket.addEventListener('close', (event) => {
          // Typed structurally: `CloseEvent` is a DOM lib type and this module
          // also compiles for the room (workerd) and the engine worker.
          const closed = event as { code?: number; reason?: string };
          log('note', 'socket closed', { code: closed?.code, reason: closed?.reason, joined });
          notifyConnection('closed');
        });
        socket.addEventListener('error', () => {
          log('warn', 'socket error', { host: options.host, room: options.room, joined });
          notifyConnection('closed');
          settle('reject', new Error(`could not connect to ${options.host}`));
        });
      }),

    disconnect: () => {
      log('note', 'disconnect', { seat: mySeat, joined });
      settle('reject', new Error('disconnected before the room answered'));
      handlers.clear();
      roomStateHandlers.clear();
      connectionHandlers.clear();
      lobbyErrorHandlers.clear();
      socket?.close();
      socket = null;
    },

    send: (command: Command) => {
      outstandingCommand = command;
      send({ type: 'command', command });
    },

    onMessage: (handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },

    onRoomState: (cb) => {
      roomStateHandlers.add(cb);
      // Replay: the frame may well have arrived before this subscriber existed.
      if (lastRoomState) {
        log('note', 'replaying room-state to a new subscriber', { phase: lastRoomState.phase });
        cb(lastRoomState);
      }
      return () => roomStateHandlers.delete(cb);
    },

    onLobbyError: (cb) => {
      lobbyErrorHandlers.add(cb);
      if (lastLobbyError) cb(lastLobbyError);
      return () => lobbyErrorHandlers.delete(cb);
    },

    onConnectionChange: (cb) => {
      connectionHandlers.add(cb);
      cb(status);
      return () => connectionHandlers.delete(cb);
    },

    roomState: () => lastRoomState,
    connectionStatus: () => status,
    seat: () => mySeat,
    token: () => myToken,
    start: () => send({ type: 'start' }),
  };
}

/** A one-line summary of an outbound frame — never the whole payload. */
function summariseClient(message: ClientMessage): Record<string, unknown> {
  switch (message.type) {
    case 'create-room':
      return { config: message.config };
    case 'command':
      return { command: message.command.type, seat: message.command.seat };
    case 'hello':
      return { protocolVersion: message.protocolVersion, hasToken: Boolean(message.token) };
    default:
      return {};
  }
}

/** A one-line summary of an inbound frame. Views and events are counted, not dumped. */
function summariseRoom(message: RoomMessage): Record<string, unknown> {
  switch (message.type) {
    case 'welcome':
      return { seat: message.seat };
    case 'room-state':
      return {
        phase: message.state.phase,
        code: message.state.code,
        seats: message.state.seats.map((s) => `${s.index}:${s.kind}${s.connected ? '' : ' (off)'}`),
      };
    case 'update':
      return {
        you: (message.view as { you?: number }).you,
        status: (message.view as { status?: string }).status,
        events: message.events.length,
        ...(message.rejection ? { rejected: message.rejection.command.type } : {}),
      };
    case 'error':
      return { code: errorCode(message.error), message: errorText(message.error) };
  }
}

/**
 * Map a wire error into a command rejection's error. An engine rejection passes
 * through verbatim; a protocol error keeps its own code, prefixed `protocol:`
 * so a consumer can tell it apart from a genuine engine code.
 */
function mapError(
  error: import('@boomtown/protocol').WireError,
): import('./types.js').RejectionError {
  if (error.kind === 'engine') return error.error;
  return { code: `protocol:${error.code}`, message: error.message };
}

function errorCode(error: import('@boomtown/protocol').WireError): string {
  return error.kind === 'engine' ? error.error.code : error.code;
}

function errorText(error: import('@boomtown/protocol').WireError): string {
  return error.kind === 'engine' ? error.error.message : error.message;
}
