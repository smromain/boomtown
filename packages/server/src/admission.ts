import type { Knocker } from '@boomtown/protocol';
import { cleanName } from './seats.js';

/**
 * Who is waiting at the door, and who may open it.
 *
 * The seat lifecycle this completes is `open -> knocking -> seated`, with
 * `declined` as the other exit. The important property is the one that is
 * *missing*: there is no path from `open` to `seated` that a joiner can drive
 * on their own. Holding the room's address, or a live ticket, moves you to
 * `knocking` and no further.
 *
 * That is deliberately the one control here that needs no identity. Every other
 * defence in this room bounds what an anonymous stranger can *do*; this one
 * lets a person who knows who they invited decide. It is also why a leaked
 * link degrades to a nuisance instead of a hijacked seat: the cost of a leak is
 * a knock the host declines, not a game already ruined.
 */

/** Longest a knock waits before the room forgets it, in milliseconds. */
export const KNOCK_TTL_MS = 5 * 60 * 1000;

export interface Knock {
  readonly id: string;
  readonly connectionId: string;
  readonly name: string;
  readonly at: number;
}

/** An opaque id for one knock. Not a credential — it only names a row for the host. */
function knockId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class Door {
  private readonly waiting = new Map<string, Knock>();
  /** Connections already turned away, so a decline is not simply re-knocked. */
  private readonly declined = new Set<string>();
  locked = false;

  /**
   * Register a knock. Returns the knock, or null when the room is locked or
   * this connection was already turned away — a declined joiner reconnecting
   * and knocking again would otherwise make "decline" mean nothing.
   */
  knock(connectionId: string, rawName: string, now: number): Knock | null {
    if (this.locked) return null;
    if (this.declined.has(connectionId)) return null;
    this.forget(now);
    const existing = [...this.waiting.values()].find((k) => k.connectionId === connectionId);
    if (existing) return existing;
    const entry: Knock = {
      id: knockId(),
      connectionId,
      name: cleanName(rawName),
      at: now,
    };
    this.waiting.set(entry.id, entry);
    return entry;
  }

  /** Take a knock off the queue by id, or null if it is unknown or expired. */
  take(id: string, now: number): Knock | null {
    this.forget(now);
    const entry = this.waiting.get(id);
    if (!entry) return null;
    this.waiting.delete(id);
    return entry;
  }

  /** Turn one away, and remember that we did. */
  decline(id: string, now: number): Knock | null {
    const entry = this.take(id, now);
    if (entry) this.declined.add(entry.connectionId);
    return entry;
  }

  /** Drop a knock because its connection went away. */
  dropConnection(connectionId: string): void {
    for (const [id, entry] of this.waiting) {
      if (entry.connectionId === connectionId) this.waiting.delete(id);
    }
  }

  /** Knocks still waiting, oldest first — the order a host works through them. */
  list(now: number): Knocker[] {
    this.forget(now);
    return [...this.waiting.values()]
      .sort((a, b) => a.at - b.at)
      .map(({ id, name }) => ({ id, name }));
  }

  /** Forget knocks nobody answered. A door that never forgets is a queue that only grows. */
  private forget(now: number): void {
    for (const [id, entry] of this.waiting) {
      if (now - entry.at >= KNOCK_TTL_MS) this.waiting.delete(id);
    }
  }
}
