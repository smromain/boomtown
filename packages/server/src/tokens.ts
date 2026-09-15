/**
 * Seat session tokens.
 *
 * A token is a bearer capability: whoever presents it is that seat, for as long
 * as the room holds it. Three properties follow from that, and each is here
 * rather than at the call site so there is one place to get them right.
 *
 * **Entropy.** 256 bits from a cryptographic source. `crypto.randomUUID` — what
 * this replaced — is 122 bits, which is not guessable either, but a token is
 * the only thing standing between a stranger and a seat in a game in progress,
 * and the cost of the stronger one is nothing.
 *
 * **Constant-time comparison.** A token check that returns early on the first
 * wrong byte leaks how much of a guess was right, which turns an impossible
 * search into a feasible one, one byte at a time. `===` on strings is exactly
 * that comparison. This is only a real concern where an attacker can time many
 * attempts, which is precisely what a public room invites.
 *
 * **Rotation.** A resume mints a fresh token and the presented one stops
 * working, so a captured token is worth one reconnect rather than the rest of
 * the game.
 */

/** 32 bytes = 256 bits, hex-encoded. */
const TOKEN_BYTES = 32;

export function mintToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compare two tokens without leaking where they first differ.
 *
 * Length is compared up front and non-constant-time on purpose: a token's
 * length is not a secret, and every token this room mints is the same length,
 * so the only thing a length difference reveals is that the candidate was not
 * minted here.
 */
export function tokensMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
