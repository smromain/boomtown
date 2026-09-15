import type { Command, Seat } from '@boomtown/engine';
import type { ClientViewDTO, EngineEventDTO } from './dto.js';
import type { WireError } from './errors.js';

/**
 * The application message union carried inside PartyKit WebSocket frames.
 * PartyKit owns the socket framing and reconnection; this is only the JSON
 * payload contract (KTD6). Every message is `{ type, ... }` so a receiver can
 * switch on `type`.
 *
 * Client -> room: `hello`, `create-room`, `knock`, `admit`, `decline`,
 * `set-locked`, `start`, `command`.
 * Room -> client: `welcome`, `waiting`, `room-state`, `update`, `error`.
 */
export type ClientMessage =
  | Hello
  | CreateRoom
  | Knock
  | Admit
  | Decline
  | SetLocked
  | Eject
  | StartGame
  | SendCommand;
export type RoomMessage = Welcome | Waiting | RoomStateMessage | Update | ErrorMessage;
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

/**
 * Sent by a joiner to ask for a seat. It does not take one.
 *
 * This is the difference between holding a way in and being in. Possession of
 * a room's address or a live ticket gets you a knock; only the host admitting
 * you binds a seat. A link that leaks therefore costs an unwanted knock rather
 * than a hijacked seat in a game already under way — and unlike every other
 * control here, it needs no identity to work.
 */
export interface Knock {
  readonly type: 'knock';
}

/** Host only: let a waiting knocker in, binding them to a seat. */
export interface Admit {
  readonly type: 'admit';
  readonly knockId: string;
}

/** Host only: turn a waiting knocker away. Their connection is closed. */
export interface Decline {
  readonly type: 'decline';
  readonly knockId: string;
}

/**
 * Host only: take a seat back from the player in it and hand it to a bot.
 *
 * The seat does not reopen — a seat that returned to `open` mid-game could be
 * claimed by whoever knocked next, handing a stranger someone else's holdings.
 * A bot is the only exit, and the game carries on from exactly where it was.
 */
export interface Eject {
  readonly type: 'eject';
  readonly seat: number;
}

/** Host only: stop accepting knocks, or start again. */
export interface SetLocked {
  readonly type: 'set-locked';
  readonly locked: boolean;
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

/** Acknowledges a `knock`: registered, and waiting on the host. */
export interface Waiting {
  readonly type: 'waiting';
}

/** Someone waiting at the door, as the host sees them. */
export interface Knocker {
  /** Opaque id for this knock — what `admit` and `decline` name. */
  readonly id: string;
  readonly name: string;
}

/** Lobby state, broadcast on every join/leave/config change before the game
 * starts, and once at game start. */
export interface RoomStateMessage {
  readonly type: 'room-state';
  readonly state: RoomState;
}

/** One authoritative game update. `view` is this connection's filtered view,
 * with legal moves and hand-tile effects the room computed (R8); `events` is
 * what changed. `rejection` is set instead when the last command was refused. */
export interface Update {
  readonly type: 'update';
  readonly view: ClientViewDTO;
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
  readonly edition: 'classic' | 'edition-2015' | 'boomtown';
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
  /**
   * The short code a player shares to get someone else in, or null once it has
   * expired or been retired. **Not** the room's address — that is the 160-bit
   * id the socket connected to, which the client already holds and which is
   * never shown or spoken (`addresses.ts`).
   */
  readonly ticket: string | null;
  readonly phase: 'lobby' | 'playing' | 'over';
  readonly config: RoomConfig;
  readonly seats: readonly SeatSlot[];
  /** The seat that may admit, decline and lock. */
  readonly hostSeat: number;
  /** Knocks waiting on the host. Only ever populated for the host's own view. */
  readonly knocks: readonly Knocker[];
  /** While locked, knocks are refused outright. */
  readonly locked: boolean;
}
