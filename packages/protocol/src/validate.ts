import { protocolError, type ProtocolError } from './errors.js';
import type { ClientMessage, RoomConfig } from './messages.js';

/**
 * The boundary between untrusted bytes and everything else.
 *
 * `reduce` is a rules referee, not a parser: handing it a shape it does not
 * expect is how a malformed frame becomes an exception in the room rather than
 * a typed refusal to the sender. So every inbound frame passes through here
 * first, and the room never sees anything this did not vouch for.
 *
 * What is checked is *structure*, not legality. A `command` is confirmed to be
 * an object carrying a string `type` and nothing more — the engine owns whether
 * that command is legal, and duplicating its union here would be two
 * definitions of the same thing, drifting apart. The line is: this module
 * guarantees the room can safely `switch` on the message and read its fields;
 * the engine guarantees the move is allowed.
 */

/**
 * Largest frame the room will look at. The biggest legitimate message is a
 * `create-room` carrying a config — hundreds of bytes — so this is orders of
 * magnitude of headroom, and still small enough that a flood of maximum-size
 * frames costs little to reject.
 */
export const MAX_MESSAGE_BYTES = 16 * 1024;

/** Longest display name accepted at the wire. `cleanName` then cuts it to its own limit. */
export const MAX_NAME_BYTES = 256;

export type ParseResult =
  | { readonly ok: true; readonly message: ClientMessage }
  | { readonly ok: false; readonly error: ProtocolError };

const fail = (message: string): ParseResult => ({
  ok: false,
  error: protocolError('malformed-message', message),
});

const tooBig = (bytes: number): ParseResult => ({
  ok: false,
  error: protocolError('message-too-large', `frame is ${bytes} bytes, limit is ${MAX_MESSAGE_BYTES}`),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Drop the keys that turn a parsed object into a prototype-pollution vector if
 * it is ever merged into another. Nothing in the message union uses them, so
 * dropping is free.
 */
function safeReviver(key: string, value: unknown): unknown {
  return key === '__proto__' || key === 'constructor' || key === 'prototype' ? undefined : value;
}

function byteLength(raw: string | ArrayBuffer | ArrayBufferView): number {
  if (typeof raw === 'string') return new TextEncoder().encode(raw).byteLength;
  return raw.byteLength;
}

const EDITIONS = new Set(['classic', 'edition-2015', 'boomtown']);
const VISIBILITIES = new Set(['open', 'hidden']);

/** Structural check on a room config. Range and rule checks stay in `configError`. */
function parseConfig(value: unknown): value is RoomConfig {
  if (!isRecord(value)) return false;
  if (!Number.isInteger(value['seatCount'])) return false;
  if (typeof value['edition'] !== 'string' || !EDITIONS.has(value['edition'])) return false;
  if (typeof value['visibility'] !== 'string' || !VISIBILITIES.has(value['visibility'])) return false;
  if (value['seed'] !== undefined && !Number.isFinite(value['seed'])) return false;
  const bots = value['bots'];
  if (!isRecord(bots)) return false;
  for (const [seat, level] of Object.entries(bots)) {
    if (!/^\d+$/.test(seat)) return false;
    if (!Number.isFinite(level)) return false;
  }
  return true;
}

/**
 * Parse and structurally validate one inbound frame.
 *
 * Returns a typed refusal rather than throwing: a hostile client should cost
 * the room one error message, not an unhandled rejection in its message loop.
 */
export function parseClientMessage(raw: string | ArrayBuffer | ArrayBufferView): ParseResult {
  const bytes = byteLength(raw);
  if (bytes > MAX_MESSAGE_BYTES) return tooBig(bytes);

  let parsed: unknown;
  try {
    const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw as ArrayBuffer);
    parsed = JSON.parse(text, safeReviver);
  } catch {
    return fail('not JSON');
  }

  if (!isRecord(parsed)) return fail('not a JSON object');
  const type = parsed['type'];
  if (typeof type !== 'string') return fail('no message type');

  switch (type) {
    case 'hello': {
      if (typeof parsed['protocolVersion'] !== 'string') return fail('hello: protocolVersion must be a string');
      const name = parsed['displayName'];
      if (typeof name !== 'string') return fail('hello: displayName must be a string');
      if (new TextEncoder().encode(name).byteLength > MAX_NAME_BYTES) return fail('hello: displayName too long');
      const token = parsed['token'];
      if (token !== undefined && typeof token !== 'string') return fail('hello: token must be a string');
      return { ok: true, message: parsed as unknown as ClientMessage };
    }
    case 'create-room': {
      if (!parseConfig(parsed['config'])) return fail('create-room: malformed config');
      return { ok: true, message: parsed as unknown as ClientMessage };
    }
    case 'knock':
    case 'start':
      return { ok: true, message: { type } as ClientMessage };
    case 'admit':
    case 'decline': {
      const knockId = parsed['knockId'];
      if (typeof knockId !== 'string' || knockId.length === 0 || knockId.length > 64) {
        return fail(`${type}: knockId must be a short string`);
      }
      return { ok: true, message: { type, knockId } as ClientMessage };
    }
    case 'set-locked': {
      if (typeof parsed['locked'] !== 'boolean') return fail('set-locked: locked must be a boolean');
      return { ok: true, message: { type, locked: parsed['locked'] } as ClientMessage };
    }
    case 'command': {
      const command = parsed['command'];
      if (!isRecord(command)) return fail('command: must be an object');
      if (typeof command['type'] !== 'string') return fail('command: no command type');
      return { ok: true, message: parsed as unknown as ClientMessage };
    }
    default:
      return fail(`unknown message type '${type}'`);
  }
}
