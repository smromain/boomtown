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

/** Room-lobby state surfaced to the UI alongside the game view. */
export interface SocketExtras {
  onRoomState(cb: (state: RoomState) => void): void;
  onConnectionChange(cb: (status: 'connecting' | 'open' | 'closed') => void): void;
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

  let socket: PartySocket | null = null;
  let mySeat: Seat | null = null;
  let myToken: string | null = options.token ?? null;
  /** The last command we sent, to attach to a rejection. */
  let lastCommand: Command | null = null;

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
          for (const h of handlers) h(toTransportMessage(view, message.events));
        }
        return;
      }
      case 'error':
        // A protocol-level error with no view — surface it as a rejection of the
        // last command if we have one, else drop (lobby errors go via room-state
        // consumers / connection status).
        if (lastCommand) {
          for (const h of handlers) {
            h({ events: [], views: {}, rejection: { command: lastCommand, error: mapError(message.error) } });
          }
        }
        return;
    }
  };

  return {
    connect: () =>
      new Promise<void>((resolve, reject) => {
        notifyConnection('connecting');
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
          if (options.intent.kind === 'create') {
            send({ type: 'create-room', config: options.intent.config });
          } else if (options.intent.kind === 'join') {
            send({ type: 'join' });
          }
          // 'resume' sends nothing — the room re-binds on the query token.
          resolve();
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
          reject(new Error(`could not connect to ${options.host}`));
        });
      }),

    disconnect: () => {
      handlers.clear();
      roomStateHandlers.clear();
      connectionHandlers.clear();
      socket?.close();
      socket = null;
    },

    send: (command: Command) => {
      lastCommand = command;
      send({ type: 'command', command });
    },

    onMessage: (handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },

    onRoomState: (cb) => {
      roomStateHandlers.add(cb);
    },

    onConnectionChange: (cb) => {
      connectionHandlers.add(cb);
    },

    seat: () => mySeat,
    token: () => myToken,
    start: () => send({ type: 'start' }),
  };
}

function mapError(
  error: import('@boomtown/protocol').WireError,
): import('@boomtown/engine').EngineError {
  if (error.kind === 'engine') return error.error;
  return { code: 'game-over', message: `${error.code}: ${error.message}` };
}
