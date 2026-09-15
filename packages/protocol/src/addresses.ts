/**
 * How a room is addressed, and how a human shares one.
 *
 * These are two different things, and collapsing them was the original
 * weakness. A room used to *be* its six-character code: the thing you read down
 * the phone was also the thing the socket connected to, so the address space
 * was however large a code a person can say out loud. That is around a billion,
 * which is unguessable among friends and enumerable from a public endpoint in
 * minutes.
 *
 * So they are split:
 *
 * - The **address** is what the socket connects to: 160 bits from a
 *   cryptographic source, never spoken, never shown. Guessing it is not a
 *   thing anyone can do.
 * - The **ticket** is what a person shares: short, typeable, minted by the
 *   room, and — crucially — *expiring*. It resolves to an address for a few
 *   minutes and then resolves to nothing, so it is a way in rather than a name.
 *
 * Both live here rather than in the server package because the client mints
 * addresses and the room validates them; one definition, not two that drift.
 */

/** Crockford-style base32: no I, L, O or U, so a spoken ticket is unambiguous. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 160 bits at 5 bits per character. */
export const ADDRESS_LENGTH = 32;

/**
 * Ticket length, in characters — 8, not the 6 this replaced.
 *
 * Eight characters of this alphabet is about 2^40 (a little over a trillion),
 * against 2^30 for six. That matters because of how a ticket is attacked: not
 * by guessing one particular ticket, but by sweeping the space hoping to land
 * on any live one. Two more characters make that sweep about a thousand times
 * longer for one extra spoken syllable, which is the cheapest trade available
 * here.
 */
export const TICKET_LENGTH = 8;

function randomFrom(alphabet: string, length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  // A plain modulo is uniform here because 256 is an exact multiple of the
  // 32-character alphabet (256 = 32 x 8): every character is reachable from
  // exactly eight byte values. This would need rejection sampling for any
  // alphabet whose size does not divide 256 — a 36-character one, say.
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

/** A fresh room address. This is the id the socket connects to. */
export function mintRoomAddress(): string {
  return randomFrom(ALPHABET, ADDRESS_LENGTH).toLowerCase();
}

/** A fresh ticket. Minted by the room, never by a client that wants a particular one. */
export function mintTicket(): string {
  return randomFrom(ALPHABET, TICKET_LENGTH);
}

export function isRoomAddress(value: string): boolean {
  return new RegExp(`^[${ALPHABET.toLowerCase()}]{${ADDRESS_LENGTH}}$`).test(value);
}

export function isTicket(value: string): boolean {
  return new RegExp(`^[${ALPHABET}]{${TICKET_LENGTH}}$`).test(value);
}

/**
 * Normalise what a person typed: upper-case, strip anything that is not in the
 * alphabet (spaces, the dash we show it with), and map the characters people
 * reliably mistype for ones that are in it.
 *
 * O/0 and I/1 are the classic pair; the alphabet excludes the letters precisely
 * so there is a single right answer when someone says "oh" or "eye".
 */
export function normaliseTicket(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/U/g, 'V')
    .replace(/[^0-9A-Z]/g, '');
}

/** How a ticket is shown to a person: `AB3K-7QXM`, which is easier to read back. */
export function formatTicket(ticket: string): string {
  return `${ticket.slice(0, 4)}-${ticket.slice(4)}`;
}
