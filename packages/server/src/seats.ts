import { PRESETS, RULES, type SetupOptions } from '@boomtown/engine';
import type { RoomConfig, SeatSlot } from '@boomtown/protocol';

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
   * Assign a fresh joiner to the first open human seat. Returns the seat and a
   * minted token, or `null` when every human seat is taken (`room-full`).
   */
  join(name: string, token: string, connectionId: string): { seat: number } | null {
    const seat = this.firstOpenSeat();
    if (seat === null) return null;
    this.humans.set(seat, { token, name, connectionId });
    return { seat };
  }

  /**
   * Restore a seat occupant from persisted connection state after a hibernation
   * wake (the in-memory map was lost; `connection.setState` survived).
   */
  restore(seat: number, token: string, name: string, connectionId: string): void {
    this.humans.set(seat, { token, name, connectionId });
  }

  /**
   * Re-bind a reconnecting human by token. Returns the seat, or `null` when
   * the token matches no seat in this room.
   */
  reconnect(token: string, connectionId: string): { seat: number } | null {
    for (const [seat, occupant] of this.humans) {
      if (occupant.token === token) {
        occupant.connectionId = connectionId;
        return { seat };
      }
    }
    return null;
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
    for (const [seat, occupant] of this.humans) {
      if (occupant.token === token) return seat;
    }
    return null;
  }

  isBot(seat: number): boolean {
    return this.botSeats().has(seat);
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

  snapshot(code: string, phase: 'lobby' | 'playing' | 'over'): {
    code: string;
    phase: 'lobby' | 'playing' | 'over';
    config: RoomConfig;
    seats: SeatSlot[];
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
    return { code, phase, config: this.config, seats };
  }
}

/** Build the engine's `SetupOptions` from a room config. Seat order is play order. */
export function setupOptionsFor(config: RoomConfig): SetupOptions {
  const seatCount = clampSeatCount(config.seatCount);
  return {
    seats: Array.from({ length: seatCount }, (_, i) => ({ name: `Seat ${i + 1}` })),
    ruleset: PRESETS[config.edition],
    visibility: config.visibility,
    turnOrder: Array.from({ length: seatCount }, (_, i) => i),
    seed: config.seed ?? Math.floor(Math.random() * 0x7fffffff),
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
