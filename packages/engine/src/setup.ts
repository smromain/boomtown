import { allTiles, type TileId } from './board.js';
import { RULES } from './constants.js';
import { INDUSTRIES, POOL, type Candidate, type Industry } from './pool.js';
import { defaultRuleset } from './ruleset/index.js';
import type { Ruleset } from './ruleset/types.js';
import { makeRng, nextInt, shuffle, type Rng } from './rng.js';
import {
  emptyHoldings,
  type Cell,
  type CorpState,
  type GameState,
  type Seat,
  type SeatState,
  type Visibility,
} from './state.js';

export interface SetupOptions {
  /** 2–6 seats, in seating order. */
  readonly seats: readonly { readonly name: string }[];
  readonly seed: number;
  readonly ruleset?: Ruleset;
  readonly visibility?: Visibility;
  /**
   * Force the company drawn for one or more industries (candidate index 0–3).
   * Anything unset is drawn with the seeded Rng. Tests use this for fixed line-ups.
   */
  readonly companyDraw?: Partial<Record<Industry, 0 | 1 | 2 | 3>>;
  /** Force the play order instead of shuffling. Must be a permutation of 0..n-1. */
  readonly turnOrder?: readonly Seat[];
}

function drawCompanies(
  rng: Rng,
  forced: Partial<Record<Industry, 0 | 1 | 2 | 3>>,
): { companies: Record<Industry, Candidate>; rng: Rng } {
  let cursor = rng;
  const companies = {} as Record<Industry, Candidate>;
  for (const industry of INDUSTRIES) {
    const forcedIndex = forced[industry];
    if (forcedIndex !== undefined) {
      companies[industry] = POOL[industry][forcedIndex];
      continue;
    }
    const draw = nextInt(cursor, 4);
    cursor = draw.rng;
    companies[industry] = POOL[industry][draw.value as 0 | 1 | 2 | 3];
  }
  return { companies, rng: cursor };
}

function freshCorporations(): Record<Industry, CorpState> {
  return Object.fromEntries(
    INDUSTRIES.map((industry): [Industry, CorpState] => [
      industry,
      { founded: false, hqTile: null, tiles: [], eaten: [] },
    ]),
  ) as Record<Industry, CorpState>;
}

/** Build a fresh game. Deterministic for a given seed and options (R7). */
export function createGame(options: SetupOptions): GameState {
  const seatCount = options.seats.length;
  if (seatCount < RULES.minPlayers || seatCount > RULES.maxPlayers) {
    throw new Error(`Boomtown is for ${RULES.minPlayers}–${RULES.maxPlayers} players, got ${seatCount}`);
  }

  const ruleset = options.ruleset ?? defaultRuleset;
  const visibility: Visibility = options.visibility ?? 'open';

  let rng = makeRng(options.seed);

  const companyDrawResult = drawCompanies(rng, options.companyDraw ?? {});
  rng = companyDrawResult.rng;

  const bagShuffle = shuffle(rng, allTiles(ruleset));
  rng = bagShuffle.rng;
  const bag = bagShuffle.value;

  const hands: TileId[][] = [];
  for (let seat = 0; seat < seatCount; seat++) {
    hands.push(bag.splice(0, RULES.handSize));
  }

  let turnOrder: Seat[];
  if (options.turnOrder) {
    turnOrder = [...options.turnOrder];
  } else {
    const order = shuffle(
      rng,
      Array.from({ length: seatCount }, (_, i) => i),
    );
    rng = order.rng;
    turnOrder = order.value;
  }

  const seats: SeatState[] = options.seats.map((seat) => ({
    name: seat.name,
    cash: RULES.startingCash,
    holdings: emptyHoldings(),
  }));

  const bankShares = Object.fromEntries(
    INDUSTRIES.map((industry) => [industry, RULES.sharesPerCorporation]),
  ) as Record<Industry, number>;

  return {
    ruleset,
    visibility,
    companies: companyDrawResult.companies,
    seats,
    turnOrder,
    turnPointer: 0,
    step: 'place',
    status: 'playing',
    cells: {} as Record<TileId, Cell>,
    corporations: freshCorporations(),
    bankShares,
    hands,
    bag,
    rng,
    merger: null,
    result: null,
  };
}
