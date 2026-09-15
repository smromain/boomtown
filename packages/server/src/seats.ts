import { PRESETS, RULES, type SetupOptions } from '@boomtown/engine';
import type { Knocker, RoomConfig, SeatSlot } from '@boomtown/protocol';
import { mintToken, tokensMatch } from './tokens.js';

/**
 * Lobby seat bookkeeping for one room. Pure and synchronous — the PartyKit
 * adapter (`room.ts`) owns storage and sockets, this owns "who is in which
 * seat". Bot seats come from the room config; human seats fill as people join.
 */
export interface SeatOccupant {
  /** The session token bound to this seat. */
  readonly token: string;
  readonly name: string;
  /** The live connection id, or null while the human is disconnected. */
  connectionId: string | null;
}

/** Longest accepted seat name. Names are untrusted input rendered straight into
 *  the board, the shareholders table and every toast, so the cap is a layout
 *  concern as much as anything. */
export const MAX_NAME_LENGTH = 24;

/**
 * Normalise an untrusted display name: NFC, strip the characters that let a
 * name misrepresent itself, collapse whitespace, cap. Returns '' for a name
 * that is blank or was made entirely of removed characters.
 *
 * The strip list is not decoration. Bidirectional overrides reorder the text
 * around them, so a name can be made to render as another player's; zero-width
 * characters produce two visibly identical names that are not equal; control
 * characters corrupt any log line the name reaches. Every client renders the
 * string the room hands it, so normalising here is what makes every client
 * agree on what a player is called.
 */
export function cleanName(raw: string): string {
  return raw
    .normalize('NFC')
    // C0/C1 controls, zero-width and BOM, bidi embedding/override/isolate marks
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, MAX_NAME_LENGTH);
}

export class SeatTable {
  private readonly humans = new Map<number, SeatOccupant>();

  constructor(private readonly config: RoomConfig) {}

  /** Seat indices that are bots, from the config. */
  private botSeats(): Set<number> {
    return new Set(Object.keys(this.config.bots).map(Number));
  }

  /** Every seat index 0..seatCount-1. */
  private allSeats(): number[] {
    return Array.from({ length: this.config.seatCount }, (_, i) => i);
  }

  /** The lowest seat index that is neither a bot nor taken by a human. */
  private firstOpenSeat(): number | null {
    const bots = this.botSeats();
    for (const seat of this.allSeats()) {
      if (bots.has(seat)) continue;
      if (this.humans.has(seat)) continue;
      return seat;
    }
    return null;
  }

  /**
   * The name to store for `seat`: cleaned, defaulted when blank, and made
   * unique within the room. The client is not the only way in — a socket URL
   * carries whatever it likes — so normalisation belongs here rather than
   * only in the lobby UI.
   */
  private nameFor(seat: number, raw: string): string {
    const base = cleanName(raw) || `Player ${seat + 1}`;
    const taken = new Set(
      [...this.humans].filter(([index]) => index !== seat).map(([, o]) => o.name),
    );
    if (!taken.has(base)) return base;
    // "Ana", "Ana (2)", "Ana (3)" — a suffix keeps both players identifiable
    // where a bare duplicate makes the whole table ambiguous.
    for (let n = 2; ; n += 1) {
      const candidate = `${base} (${n})`;
      if (!taken.has(candidate)) return candidate;
    }
  }

  /**
   * Assign a fresh joiner to the first open human seat. Returns the seat and a
   * minted token, or `null` when every human seat is taken (`room-full`).
   */
  join(name: string, token: string, connectionId: string): { seat: number } | null {
    const seat = this.firstOpenSeat();
    if (seat === null) return null;
    this.humans.set(seat, { token, name: this.nameFor(seat, name), connectionId });
    return { seat };
  }

  /**
   * Restore a seat occupant from persisted connection state after a hibernation
   * wake (the in-memory map was lost; `connection.setState` survived).
   */
  restore(seat: number, token: string, name: string, connectionId: string): string {
    // `nameFor` excludes this seat from the taken set, so restoring a name the
    // seat already holds does not walk it up to "Ana (2)" on every wake.
    const stored = this.nameFor(seat, name);
    this.humans.set(seat, { token, name: stored, connectionId });
    return stored;
  }

  /**
   * Re-bind a reconnecting human by token, rotating the token as it goes.
   * Returns the seat and the *new* token to hand back, or `null` when the
   * token matches no seat in this room.
   *
   * Every occupant is compared even after a match, so the time this takes does
   * not depend on which seat the token belongs to — a loop that returned early
   * would leak seat order to anyone who could time it.
   */
  reconnect(token: string, connectionId: string): { seat: number; token: string } | null {
    let found: { seat: number; occupant: SeatOccupant } | null = null;
    for (const [seat, occupant] of this.humans) {
      if (tokensMatch(occupant.token, token)) found = { seat, occupant };
    }
    if (!found) return null;
    const rotated = mintToken();
    this.humans.set(found.seat, {
      token: rotated,
      name: found.occupant.name,
      connectionId,
    });
    return { seat: found.seat, token: rotated };
  }

  /** Mark a human's seat disconnected (keeps the seat reserved by token). */
  disconnect(connectionId: string): void {
    for (const occupant of this.humans.values()) {
      if (occupant.connectionId === connectionId) occupant.connectionId = null;
    }
  }

  seatForConnection(connectionId: string): number | null {
    for (const [seat, occupant] of this.humans) {
      if (occupant.connectionId === connectionId) return seat;
    }
    return null;
  }

  seatForToken(token: string): number | null {
    let found: number | null = null;
    for (const [seat, occupant] of this.humans) {
      if (tokensMatch(occupant.token, token)) found = seat;
    }
    return found;
  }

  isBot(seat: number): boolean {
    return this.botSeats().has(seat);
  }

  /**
   * Display names in play order: a joined human's name, `Bot N` for a bot seat,
   * `Seat N` for a human seat nobody has taken yet. Fed into the engine's
   * `SetupOptions` so `viewFor` — and every name the online client shows — is
   * the real one, not the `Seat N` placeholder. Names never change after the
   * deal and never affect it, so this is replay-safe (KTD13).
   */
  displayNames(): string[] {
    const bots = this.botSeats();
    return this.allSeats().map((index) => {
      if (bots.has(index)) return `Bot ${index + 1}`;
      return this.humans.get(index)?.name ?? `Seat ${index + 1}`;
    });
  }

  botDifficulty(seat: number): number {
    return this.config.bots[seat] ?? 5;
  }

  /** Every human seat is filled (bots are always "filled"). */
  allSeatsFilled(): boolean {
    const bots = this.botSeats();
    return this.allSeats().every((seat) => bots.has(seat) || this.humans.has(seat));
  }

  /** The current live connection ids, seat-indexed (null where disconnected/bot). */
  liveConnections(): { seat: number; connectionId: string | null }[] {
    return this.allSeats().map((seat) => ({
      seat,
      connectionId: this.humans.get(seat)?.connectionId ?? null,
    }));
  }

  snapshot(
    ticket: string | null,
    phase: 'lobby' | 'playing' | 'over',
    door: { hostSeat: number; knocks: readonly Knocker[]; locked: boolean },
  ): {
    ticket: string | null;
    phase: 'lobby' | 'playing' | 'over';
    config: RoomConfig;
    seats: SeatSlot[];
    hostSeat: number;
    knocks: readonly Knocker[];
    locked: boolean;
  } {
    const bots = this.botSeats();
    const seats: SeatSlot[] = this.allSeats().map((index) => {
      if (bots.has(index)) {
        return { index, kind: 'bot', name: `Bot ${index + 1}`, connected: true };
      }
      const occupant = this.humans.get(index);
      if (!occupant) return { index, kind: 'open', name: null, connected: false };
      return {
        index,
        kind: 'human',
        name: occupant.name,
        connected: occupant.connectionId !== null,
      };
    });
    return { ticket, phase, config: this.config, seats, ...door };
  }
}

/**
 * Build the engine's `SetupOptions` from a room config. Seat order is play
 * order. The config's seed MUST already be resolved to a concrete value —
 * `GameRoom` does this in its constructor. A `setupOptionsFor` call that
 * invented its own seed would deal a different game on every hibernation wake
 * and permanently break replay (KTD13, R7).
 */
export function setupOptionsFor(config: RoomConfig, names?: readonly string[]): SetupOptions {
  if (config.seed === undefined) {
    throw new Error('setupOptionsFor requires a resolved seed (GameRoom resolves it at creation)');
  }
  const seatCount = clampSeatCount(config.seatCount);
  return {
    seats: Array.from({ length: seatCount }, (_, i) => ({ name: names?.[i] ?? `Seat ${i + 1}` })),
    ruleset: PRESETS[config.edition],
    visibility: config.visibility,
    turnOrder: Array.from({ length: seatCount }, (_, i) => i),
    seed: config.seed,
  };
}

export function clampSeatCount(count: number): number {
  return Math.max(RULES.minPlayers, Math.min(RULES.maxPlayers, Math.round(count)));
}

/** Validate a room config enough to start a game. Returns an error string or null. */
export function configError(config: RoomConfig): string | null {
  if (config.seatCount < RULES.minPlayers || config.seatCount > RULES.maxPlayers) {
    return `seat count must be ${RULES.minPlayers}–${RULES.maxPlayers}`;
  }
  for (const [seat, level] of Object.entries(config.bots)) {
    const index = Number(seat);
    if (!Number.isInteger(index) || index < 0 || index >= config.seatCount) {
      return `bot seat ${seat} is out of range`;
    }
    if (level < 1 || level > 10) return `bot difficulty ${level} out of range`;
  }
  return null;
}
