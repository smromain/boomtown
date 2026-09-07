import type { Command, Seat } from '@boomtown/engine';
import type { EngineEventDTO, PlayerViewDTO } from './dto.js';
import type { WireError } from './errors.js';

/**
 * The application message union carried inside PartyKit WebSocket frames.
 * PartyKit owns the socket framing and reconnection; this is only the JSON
 * payload contract (KTD6). Every message is `{ type, ... }` so a receiver can
 * switch on `type`.
 *
 * Client -> room: `hello`, `create-room`, `join`, `command`, `start`.
 * Room -> client: `welcome`, `room-state`, `update`, `error`.
 */
export type ClientMessage = Hello | CreateRoom | JoinRoom | StartGame | SendCommand;
export type RoomMessage = Welcome | RoomStateMessage | Update | ErrorMessage;
export type WireMessage = ClientMessage | RoomMessage;

// --- client -> room -------------------------------------------------------

/** First message on every connection. Carries the protocol version and the
 * seat token if this is a reconnect. */
export interface Hello {
  readonly type: 'hello';
  readonly protocolVersion: string;
  readonly displayName: string;
  /** Present on reconnect; absent on a first join. */
  readonly token?: string;
}

/** Sent by the room creator right after `hello` to configure the game. */
export interface CreateRoom {
  readonly type: 'create-room';
  readonly config: RoomConfig;
}

/** Sent by a joiner after `hello` to take an open seat. */
export interface JoinRoom {
  readonly type: 'join';
}

/** The creator starts the game once seats are filled. */
export interface StartGame {
  readonly type: 'start';
}

export interface SendCommand {
  readonly type: 'command';
  readonly command: Command;
}

// --- room -> client -------------------------------------------------------

/** Acknowledges `hello`/`join`, assigning this connection its seat and token. */
export interface Welcome {
  readonly type: 'welcome';
  readonly seat: Seat;
  readonly token: string;
}

/** Lobby state, broadcast on every join/leave/config change before the game
 * starts, and once at game start. */
export interface RoomStateMessage {
  readonly type: 'room-state';
  readonly state: RoomState;
}

/** One authoritative game update. `view` is this connection's filtered view;
 * `events` is what changed. `rejection` is set instead when the last command
 * was refused. */
export interface Update {
  readonly type: 'update';
  readonly view: PlayerViewDTO;
  readonly events: readonly EngineEventDTO[];
  readonly rejection?: { readonly command: Command; readonly error: WireError };
}

export interface ErrorMessage {
  readonly type: 'error';
  readonly error: WireError;
}

// --- shared shapes -------------------------------------------------------

/** Room-creation options. Mirrors the local `GameConfig` (apps/desktop setup)
 * minus per-seat human/bot names, which the lobby assigns as people join. */
export interface RoomConfig {
  readonly seatCount: number;
  readonly edition: 'classic' | 'edition-2015';
  readonly visibility: 'open' | 'hidden';
  /** Seat index -> bot difficulty (1–10). Absent index = human seat. */
  readonly bots: Readonly<Record<number, number>>;
  readonly seed?: number;
}

export interface SeatSlot {
  readonly index: number;
  readonly kind: 'open' | 'human' | 'bot';
  readonly name: string | null;
  readonly connected: boolean;
}

export interface RoomState {
  readonly code: string;
  readonly phase: 'lobby' | 'playing' | 'over';
  readonly config: RoomConfig;
  readonly seats: readonly SeatSlot[];
}
