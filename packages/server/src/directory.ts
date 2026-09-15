import type * as Party from 'partykit/server';
import { isRoomAddress, isTicket } from '@boomtown/protocol';
import { roomLog, roomWarn } from './log.js';

/**
 * The ticket directory: one durable object *per ticket*, holding the room
 * address that ticket resolves to, and nothing else.
 *
 * One object per ticket rather than one registry holding all of them. A single
 * registry would be a hot object every join goes through, a single thing to
 * lose, and a list of every live room in one place. Sharding by ticket means a
 * lookup only ever touches the ticket it asked about, and the object for an
 * unissued ticket is simply empty.
 *
 * **What this does and does not defend against.** It does not meaningfully
 * rate-limit a sweep of the ticket space: an attacker guessing many tickets
 * touches a different object each time, so no single object sees the pattern.
 * What defends is arithmetic. The live set is tiny — a handful of rooms forming
 * at any moment — against 2^40 tickets, and each one expires in minutes. Even
 * at a hundred thousand guesses a second, landing on a live ticket is a matter
 * of months, and the reward is a knock at a room whose host still has to admit
 * you. The short life of a ticket is the control; this object only has to not
 * undermine it.
 */

/** How long a ticket resolves for. Long enough to read one out and have it typed back. */
export const TICKET_TTL_MS = 15 * 60 * 1000;

const ENTRY_KEY = 'entry';

interface TicketEntry {
  readonly address: string;
  /** Epoch ms after which this ticket resolves to nothing. */
  readonly expiresAt: number;
}

/**
 * Every refusal looks the same from outside: same status, same empty body.
 * An unissued ticket, an expired one and a retired one are indistinguishable,
 * so a sweep learns nothing from the shape of a miss.
 */
const miss = () => new Response(null, { status: 404 });

export default class TicketDirectory implements Party.Server {
  readonly options = { hibernate: true };

  constructor(readonly room: Party.Room) {}

  async onRequest(request: Party.Request): Promise<Response> {
    const ticket = this.room.id;
    if (!isTicket(ticket)) return miss();

    if (request.method === 'GET') return this.resolve();
    if (request.method === 'POST') return this.claim(ticket, request);
    if (request.method === 'DELETE') return this.retire(ticket);
    return miss();
  }

  /** Resolve a ticket to its room address, or miss. */
  private async resolve(): Promise<Response> {
    const entry = await this.room.storage.get<TicketEntry>(ENTRY_KEY);
    if (!entry) return miss();
    if (Date.now() >= entry.expiresAt) {
      // Expire lazily on read as well as by alarm: whichever happens first,
      // the ticket stops resolving at the same moment.
      await this.room.storage.delete(ENTRY_KEY);
      return miss();
    }
    return Response.json({ address: entry.address });
  }

  /**
   * Claim this ticket for a room address. Refused if the ticket is already
   * taken and unexpired — the caller mints another and tries again, which is
   * what stops one room from stealing another's ticket.
   */
  private async claim(ticket: string, request: Party.Request): Promise<Response> {
    let address: unknown;
    try {
      address = ((await request.json()) as { address?: unknown }).address;
    } catch {
      return miss();
    }
    if (typeof address !== 'string' || !isRoomAddress(address)) return miss();

    const existing = await this.room.storage.get<TicketEntry>(ENTRY_KEY);
    if (existing && Date.now() < existing.expiresAt && existing.address !== address) {
      roomWarn(ticket, 'ticket already claimed by another room');
      return new Response(null, { status: 409 });
    }

    const expiresAt = Date.now() + TICKET_TTL_MS;
    await this.room.storage.put<TicketEntry>(ENTRY_KEY, { address, expiresAt });
    await this.room.storage.setAlarm(expiresAt);
    roomLog(ticket, 'ticket claimed', { expiresInMs: TICKET_TTL_MS });
    return Response.json({ ticket, expiresAt });
  }

  /**
   * Retire a ticket early — the room calls this once its seats are full, so a
   * code that has already done its job stops being a way in at all.
   */
  private async retire(ticket: string): Promise<Response> {
    await this.room.storage.delete(ENTRY_KEY);
    await this.room.storage.deleteAlarm();
    roomLog(ticket, 'ticket retired');
    return new Response(null, { status: 204 });
  }

  /** TTL reached: forget the mapping. */
  async onAlarm(): Promise<void> {
    await this.room.storage.delete(ENTRY_KEY);
  }
}
