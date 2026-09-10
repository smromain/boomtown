/**
 * In-theme default names for online play, so nobody joins a room as the
 * literal placeholder "Player 1" — which is what everyone did, because the
 * field shipped pre-filled with it and most people never changed it (#16).
 *
 * The vocabulary is the game's own: frontier boom-town money. Every pairing is
 * original and generic — no company in the pool, no real brand, nothing
 * gendered — so a generated name can never collide with a corporation name on
 * the board or need a trademark thought.
 */
const ADJECTIVES = [
  'Amber', 'Brass', 'Copper', 'Dusty', 'Gilded', 'Hollow', 'Iron', 'Lucky',
  'Restless', 'Silver', 'Sly', 'Bold', 'Quick', 'Grand', 'Flint', 'Rusty',
  'Golden', 'Idle', 'Shrewd', 'Humble',
] as const;

const NOUNS = [
  'Prospector', 'Magnate', 'Tycoon', 'Broker', 'Speculator', 'Raider',
  'Wildcat', 'Trader', 'Founder', 'Investor', 'Stakeholder', 'Partner',
  'Backer', 'Shark', 'Dealer', 'Upstart',
] as const;

/** The longest name this can produce, so callers can size a field for it. */
export const MAX_GENERATED_NAME_LENGTH = 24;

/**
 * A fresh two-word name, e.g. "Gilded Wildcat". 320 combinations, which is
 * plenty for a six-seat room — and the server de-duplicates anyway, so a
 * collision costs a suffix rather than an identity.
 */
export function randomName(): string {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]!;
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]!;
  return `${adjective} ${noun}`;
}
