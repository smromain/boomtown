import type { Tier } from './ruleset/types.js';

/**
 * The seven industries. A game draws one company per industry, so there are
 * always seven corporations, one of each, and the industry marks stay unique on
 * the board. Tier and colour belong to the industry, not the company — swapping
 * a name in or out cannot affect balance (`docs/naming.md`).
 */
export type Industry =
  | 'books'
  | 'electronics'
  | 'air'
  | 'energy'
  | 'tech'
  | 'video'
  | 'toys';

/** Canonical industry order — used for deterministic iteration and turn-independent tie handling. */
export const INDUSTRIES: readonly Industry[] = [
  'books',
  'electronics',
  'air',
  'energy',
  'tech',
  'video',
  'toys',
];

export interface IndustryInfo {
  readonly tier: Tier;
  /** Board badge / marker colour. Fixed for the whole game; never derived from the display name. */
  readonly color: string;
  /** Legible ink colour over `color`. */
  readonly ink: string;
}

/**
 * The seven board colours, re-spaced (#18). Each keeps its industry's hue family
 * — gold, red, blue, green, purple, magenta, teal — so identities are unchanged;
 * what moved is **lightness**, and that is the whole point.
 *
 * The old palette put six of the seven inside an 11-point L* band, so almost
 * every merger repainted the board from one colour to another of identical
 * weight — the hardest kind of change for an eye to catch, and the exact thing a
 * merger does. Under simulated protanopia `air` and `tech` were 2.5 apart in
 * CIEDE2000 and under deuteranopia `energy` and `video` were 2.2: not "close"
 * but indistinguishable, in a game where chain identity drives every decision.
 *
 * These are the minimum-drift colours that satisfy all of it at once — five of
 * the seven barely moved. `test/palette.test.ts` holds the thresholds and will
 * fail if a future edit lands back in the old trap. Note the constraints are
 * deliberately NOT tier-aligned: giving each tier a lightness band would put the
 * corporations of a tier at equal luminance and re-create the original failure
 * inside each one.
 */
export const INDUSTRY_INFO: Record<Industry, IndustryInfo> = {
  books: { tier: 1, color: '#D7A329', ink: '#221E12' },
  electronics: { tier: 1, color: '#C64E25', ink: '#FFFFFF' },
  air: { tier: 2, color: '#355C99', ink: '#FFFFFF' },
  energy: { tier: 2, color: '#4A9471', ink: '#221E12' },
  tech: { tier: 2, color: '#AC7CEF', ink: '#221E12' },
  video: { tier: 3, color: '#971D50', ink: '#FFFFFF' },
  toys: { tier: 3, color: '#66CAD8', ink: '#221E12' },
};

export interface Candidate {
  readonly baseName: string;
  readonly flavour: string;
}

/**
 * Four candidate companies per industry. 7 industries x 4 candidates = 16,384
 * possible line-ups. The `riffing on` design note from `docs/naming.md` is
 * deliberately absent — it must not ship as a string anywhere in the product.
 */
export const POOL: Record<Industry, readonly [Candidate, Candidate, Candidate, Candidate]> = {
  books: [
    { baseName: 'Chapter Eleven', flavour: 'books, coffee, a deep sense of denial' },
    { baseName: 'A-Mart', flavour: 'home of the green light bargain' },
    { baseName: 'Seers Roadbuck', flavour: 'for when you want to buy a wrench or an entire house' },
    { baseName: 'Waldenbust', flavour: 'the finest bookstore at your local airport' },
  ],
  electronics: [
    { baseName: 'Radio Hut', flavour: 'weird batteries and $70 HDMI cables' },
    { baseName: 'Circuit Village', flavour: 'the warranty is the product' },
    { baseName: 'Barbages', flavour: "used video games, consoles and inexplicably, crypto, i think?" },
    { baseName: 'Fried Electronics', flavour: "aisles of the same cables you have in a box somewhere" },
  ],
  air: [
    { baseName: 'Pan-Canadian', flavour: 'catch them if you can, eh!' },
    { baseName: 'Transworld Air', flavour: 'wings over everywhere' },
    { baseName: 'ValueJet', flavour: "costs a dollar to use the bathroom and two dollars to flush" },
    { baseName: 'Concordia', flavour: 'there at breakfast, broke by lunch' },
  ],
  energy: [
    { baseName: 'Enrun', flavour: 'energy, creatively accounted for' },
    { baseName: 'English Petrochemical', flavour: 'with apologies to the seals' },
    { baseName: 'Standard Oyl', flavour: 'too big, then thirty-four pieces' },
    { baseName: 'Tesler', flavour: 'are they the baddies?' },
  ],
  tech: [
    { baseName: 'Blackcurrant', flavour: "a keyboard? for a phone? now i've seen everything" },
    { baseName: 'Noquia', flavour: 'indestructible, briefly essential' },
    { baseName: 'Palmistry', flavour: 'the future, in your palm, in 1998' },
    { baseName: 'Netscapade', flavour: 'we were the internet once' },
  ],
  video: [
    { baseName: 'Webflicks', flavour: 'for when you want to barely pay attention to a movie' },
    { baseName: 'Tinseltown Video', flavour: "1 copy of a new release and 42 copies of 'Never Been Smooched'" },
    { baseName: 'Fotomatic', flavour: "we promise we don't look at your pictures, wink wink" },
    { baseName: 'The Record Empire', flavour: "where every day is Tex Hanning day!" },
  ],
  toys: [
    { baseName: 'Toys Я Were', flavour: 'where a kid was a customer, now the giraffe is unemployed' },
    { baseName: 'Kaybee Toyworks', flavour: "the mall's loudest storefront" },
    { baseName: 'Chuck E. Wheeze', flavour: 'the rat casino where you gamble your life away for a sticky hand' },
    { baseName: 'Discovery Zonked', flavour: 'come see our ball pit of uncertain hygiene' },
  ],
};

export function tierOf(industry: Industry): Tier {
  return INDUSTRY_INFO[industry].tier;
}
