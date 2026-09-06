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
    { baseName: 'Chapter Eleven', flavour: 'books, coffee, denial' },
    { baseName: 'Woolyworth', flavour: 'everything, sort of, cheap' },
    { baseName: 'Seers Roebeck', flavour: 'the catalogue was the internet' },
    { baseName: 'Waldenbust', flavour: 'the finest bookstore at your local airport' },
  ],
  electronics: [
    { baseName: 'Radio Hut', flavour: 'batteries, phones and $70 HDMI cables' },
    { baseName: 'Circuit Village', flavour: 'the warranty is the product' },
    { baseName: 'Compuwas', flavour: 'beige boxes, bold promises' },
    { baseName: 'Fried Electronics', flavour: "an aisle of cables you don't need" },
  ],
  air: [
    { baseName: 'Pan-Atlas', flavour: 'the glamour of air travel' },
    { baseName: 'Transworld Air', flavour: 'wings over everywhere' },
    { baseName: 'Braniffle', flavour: 'the plane is painted orange' },
    { baseName: 'Concordia', flavour: 'there at breakfast, broke by lunch' },
  ],
  energy: [
    { baseName: 'Enrun', flavour: 'energy, creatively accounted' },
    { baseName: 'Texicorps', flavour: 'a star, a pump, a lawsuit' },
    { baseName: 'Standard Oyl', flavour: 'too big, then thirty-four pieces' },
    { baseName: 'Wattage', flavour: 'power, unapologetically' },
  ],
  tech: [
    { baseName: 'Blackcurrant', flavour: 'the keyboard people' },
    { baseName: 'Noquia', flavour: 'indestructible, briefly essential' },
    { baseName: 'Palmistry', flavour: 'the future, in your palm, in 1998' },
    { baseName: 'Netscapade', flavour: 'we were the internet once' },
  ],
  video: [
    { baseName: 'Megahit Video', flavour: 'be kind, rewind' },
    { baseName: 'Tinseltown Video', flavour: "new releases and 42 copies of 'Next Friday'" },
    { baseName: 'Fotomatic', flavour: 'one hour, one kiosk, one photo' },
    { baseName: 'Tower of Records', flavour: 'listening booths, teenage employees and no returns' },
  ],
  toys: [
    { baseName: 'Toys Я Were', flavour: 'where a kid was a customer' },
    { baseName: 'Kaybee Toyworks', flavour: "the mall's loudest storefront" },
    { baseName: 'Chuck E. Wheeze', flavour: 'animatronics and birthday grief' },
    { baseName: 'Discovery Zonked', flavour: 'a ball pit of uncertain hygiene' },
  ],
};

export function tierOf(industry: Industry): Tier {
  return INDUSTRY_INFO[industry].tier;
}
