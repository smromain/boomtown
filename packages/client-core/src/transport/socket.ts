import PartySocket from 'partysocket';
import type { Command, Seat } from '@boomtown/engine';
import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type RoomConfig,
  type RoomMessage,
  type RoomState,
} from '@boomtown/protocol';
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
}

/** A lobby / protocol error that is not tied to a game command. */
export interface LobbyError {
  readonly code: string;
  readonly message: string;
}

/** Room-lobby state surfaced to the UI alongside the game view. */
export interface SocketExtras {
  /** Returns an unsubscribe. */
  onRoomState(cb: (state: RoomState) => void): () => void;
  /** Returns an unsubscribe. */
  onConnectionChange(cb: (status: 'connecting' | 'open' | 'closed') => void): () => void;
  /**
   * Fired for every room `error` frame that is not a rejection of an
   * outstanding command — room-full, wrong-version, "no such room", a stuck
   * game. Returns an unsubscribe.
   */
  onLobbyError(cb: (error: LobbyError) => void): () => void;
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
 */
export function socketTransport(
  options: SocketTransportOptions,
): GameTransport & SocketExtras {
  const handlers = new Set<(message: TransportMessage) => void>();
  const roomStateHandlers = new Set<(state: RoomState) => void>();
  const connectionHandlers = new Set<(status: 'connecting' | 'open' | 'closed') => void>();
  const lobbyErrorHandlers = new Set<(error: LobbyError) => void>();

  let socket: PartySocket | null = null;
  let mySeat: Seat | null = null;
  let myToken: string | null = options.token ?? null;
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

  const notifyConnection = (status: 'connecting' | 'open' | 'closed') => {
    for (const cb of connectionHandlers) cb(status);
  };

  const send = (message: ClientMessage) => {
    socket?.send(JSON.stringify(message));
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
    switch (message.type) {
      case 'welcome':
        mySeat = message.seat;
        myToken = message.token;
        joined = true;
        settleConnect?.resolve();
        settleConnect = null;
        return;
      case 'room-state':
        for (const cb of roomStateHandlers) cb(message.state);
        return;
      case 'update': {
        // The room sends a full ClientViewDTO (legalMoves + handTiles computed
        // server-side), so it is exactly the store's ClientView — pass through.
        const view = message.view as ClientView;
        if (message.rejection) {
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
          for (const h of handlers) {
            h({ events: [], views: {}, rejection: { command, error: mapError(message.error) } });
          }
        } else if (!joined && settleConnect) {
          // The room rejected our create/join before we ever got a seat.
          settleConnect.reject(new Error(`${err.code}: ${err.message}`));
          settleConnect = null;
        } else {
          // A lobby / room-level error with no command behind it.
          for (const cb of lobbyErrorHandlers) cb(err);
        }
        return;
      }
    }
  };

  return {
    connect: () =>
      new Promise<void>((resolve, reject) => {
        notifyConnection('connecting');
        const isResume = options.intent.kind === 'resume';
        settleConnect = { resolve, reject };
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
          if (isResume || joined) {
            settleConnect?.resolve();
            settleConnect = null;
          }
        });

        socket.addEventListener('message', (event) => {
          try {
            onRoomMessage(JSON.parse(String((event as MessageEvent).data)) as RoomMessage);
          } catch {
            // ignore non-JSON frames
          }
        });

        socket.addEventListener('close', () => notifyConnection('closed'));
        socket.addEventListener('error', () => {
          notifyConnection('closed');
          if (settleConnect) {
            settleConnect.reject(new Error(`could not connect to ${options.host}`));
            settleConnect = null;
          }
        });
      }),

    disconnect: () => {
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
      return () => roomStateHandlers.delete(cb);
    },

    onLobbyError: (cb) => {
      lobbyErrorHandlers.add(cb);
      return () => lobbyErrorHandlers.delete(cb);
    },

    onConnectionChange: (cb) => {
      connectionHandlers.add(cb);
      return () => connectionHandlers.delete(cb);
    },

    seat: () => mySeat,
    token: () => myToken,
    start: () => send({ type: 'start' }),
  };
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
