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

export const INDUSTRY_INFO: Record<Industry, IndustryInfo> = {
  books: { tier: 1, color: '#D9A425', ink: '#221E12' },
  electronics: { tier: 1, color: '#C64A20', ink: '#FFFFFF' },
  air: { tier: 2, color: '#2C5AA0', ink: '#FFFFFF' },
  energy: { tier: 2, color: '#2C7A57', ink: '#FFFFFF' },
  tech: { tier: 2, color: '#6B4B98', ink: '#FFFFFF' },
  video: { tier: 3, color: '#AE3462', ink: '#FFFFFF' },
  toys: { tier: 3, color: '#22808F', ink: '#FFFFFF' },
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
    { baseName: 'Seers Roebeck', flavour: 'you mean you can buy a house from there?' },
    { baseName: 'Waldenbust', flavour: 'the finest bookstore at your local airport' },
  ],
  electronics: [
    { baseName: 'Radio Hut', flavour: 'weird batteries and $70 HDMI cables' },
    { baseName: 'Circuit Village', flavour: 'the warranty is the product' },
    { baseName: 'Compuwas', flavour: 'beige boxes, bold promises' },
    { baseName: 'Fried Electronics', flavour: "an aisle of the same cables you have in a box somewhere" },
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
    { baseName: 'Blackcurrant', flavour: "a keyboard? on a phone? now i've seen everything" },
    { baseName: 'Noquia', flavour: 'indestructible, briefly essential' },
    { baseName: 'Palmistry', flavour: 'the future, in your palm, in 1998' },
    { baseName: 'Netscapade', flavour: 'we were the internet once' },
  ],
  video: [
    { baseName: 'Webflicks', flavour: 'for when you want to barely pay attention to a movie' },
    { baseName: 'Tinseltown Video', flavour: "1 copy of a new release and 42 copies of 'Never Been Smooched'" },
    { baseName: 'Fotomatic', flavour: 'one hour, one kiosk, one photo' },
    { baseName: 'The Record Empire', flavour: "where every day is Tex Hanning day!" },
  ],
  toys: [
    { baseName: 'Toys Я Were', flavour: 'where a kid was a customer, and the giraffe is unemployed' },
    { baseName: 'Kaybee Toyworks', flavour: "the mall's loudest storefront" },
    { baseName: 'Chuck E. Wheeze', flavour: 'the rat casino where you gamble your life away for a sticky hand' },
    { baseName: 'Discovery Zonked', flavour: 'come see our ball pit of uncertain hygiene' },
  ],
};

export function tierOf(industry: Industry): Tier {
  return INDUSTRY_INFO[industry].tier;
}
