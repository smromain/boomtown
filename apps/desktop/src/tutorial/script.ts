import type { GameClientState } from '@boomtown/client-core';
import {
  INDUSTRIES,
  PRESETS,
  allTiles,
  createGame,
  sharePriceOf,
  type Command,
  type GameState,
  type Industry,
  type Seat,
  type SetupOptions,
  type TileId,
} from '@boomtown/engine';

/**
 * The tutorial's table: a short game dealt mid-way, so that every core
 * mechanic comes up in three of your turns, in order.
 *
 * 1. Play 7F beside the loose 6F and found a company (call it A), then buy it.
 * 2. Play 6G and A grows.
 * 3. Play 8F between A and Tech. Tech is bigger and takes A over, which pays
 *    A's holders and asks what to do with its shares. Tech reaches 13 tiles,
 *    which makes it safe — and with Energy already safe, the table may vote to
 *    end the game. You move; your rivals back you; the game settles.
 *
 * The rivals play from a script (`rivalMove`), so the board around you is the
 * same every time. Your own moves are steered rather than free: `allows` says
 * which commands a step accepts, and the tutorial turns away anything else.
 *
 * Everything here is pure, so the whole script is tested by playing it
 * through the engine (`tutorial.test.ts`).
 */

export const YOU: Seat = 0;

/** Safe from the start, so one more safe company opens the vote. */
const ENERGY_TILES: TileId[] = ['1A', '2A', '3A', '4A', '1B', '2B', '3B', '4B', '1C', '2C', '3C'];
/** The company that takes yours over. */
const TECH_TILES: TileId[] = ['9E', '10E', '11E', '9F', '10F', '11F', '10G'];
/** Loose tiles: 6F is yours to found on, 3H is a rival's, 12C is scenery. */
const LOOSE: TileId[] = ['6F', '3H', '12C'];

/** The three tiles you are asked to play, in order. */
export const YOUR_TILES = ['7F', '6G', '8F'] as const;

const HANDS: TileId[][] = [
  [...YOUR_TILES, '1I', '12I', '5D'],
  // Grows Tech twice.
  ['12E', '10H', '12A', '7I', '9B', '5H'],
  // Founds a company on 3H, then grows Energy.
  ['3I', '1D', '8C', '11A', '6B', '9I'],
];

/** Where your company and the rival's are founded — how the script finds them. */
const YOUR_FOUNDING = '7F';
const RIVAL_FOUNDING = '3I';

/** What each rival buys, turn by turn. `yours` and `theirs` are resolved off the board. */
type Buy = 'yours' | 'theirs' | Industry;
const RIVAL_BUYS: Record<number, readonly (readonly Buy[])[]> = {
  1: [['yours', 'tech'], ['tech', 'tech']],
  2: [['theirs', 'theirs'], []],
};

export interface TutorialNames {
  readonly you: string;
  readonly rivals: readonly [string, string];
}

/** The setup the table nominally comes from — the seats, the ruleset and a fixed seed. */
export function tutorialSetup(names: TutorialNames): SetupOptions {
  return {
    seats: [{ name: names.you }, { name: names.rivals[0] }, { name: names.rivals[1] }],
    seed: 20261001,
    ruleset: PRESETS.boomtown,
    turnOrder: [0, 1, 2],
    // Energy and Tech by the names a first game is most likely to see.
    companyDraw: { energy: 0, tech: 0 },
  };
}

/** The tutorial's opening state: a fresh Boomtown table with the scripted board, hands and books laid over it. */
export function tutorialGame(names: TutorialNames): GameState {
  const state = structuredClone(createGame(tutorialSetup(names)));

  const found = (industry: Industry, tiles: TileId[], hq: TileId) => {
    for (const tile of tiles) state.cells[tile] = { kind: 'corporation', industry };
    state.corporations[industry] = { founded: true, hqTile: hq, tiles: [...tiles], eaten: [] };
  };
  found('energy', ENERGY_TILES, '2B');
  found('tech', TECH_TILES, '10F');
  for (const tile of LOOSE) state.cells[tile] = { kind: 'unincorporated' };

  // You hold some of the safe company, so the vote at the end is yours too.
  const books: { cash: number; holdings: Partial<Record<Industry, number>> }[] = [
    { cash: 6000, holdings: { energy: 4 } },
    { cash: 2400, holdings: { energy: 2, tech: 3 } },
    { cash: 3000, holdings: { energy: 2, tech: 3 } },
  ];
  books.forEach(({ cash, holdings }, seat) => {
    state.seats[seat]!.cash = cash;
    for (const [industry, count] of Object.entries(holdings) as [Industry, number][]) {
      state.seats[seat]!.holdings[industry] = count;
      state.bankShares[industry] -= count;
    }
  });

  state.hands = HANDS.map((hand) => [...hand]);
  // The rest of the bag in board order, so the draws are as fixed as the deal.
  const dealt = new Set<TileId>([...Object.keys(state.cells), ...HANDS.flat()]);
  state.bag = allTiles(state.ruleset).filter((tile) => !dealt.has(tile));
  return state;
}

/** The industry whose company sits on `tile`, if one does. */
function companyAt(state: Pick<GameState, 'cells'>, tile: TileId): Industry | null {
  const cell = state.cells[tile];
  return cell?.kind === 'corporation' ? cell.industry : null;
}

/**
 * A rival's next move, or null to let its ordinary policy decide. Reads only
 * what that rival may see: the board, and its own hand to know how far through
 * its script it is.
 */
export function rivalMove(state: GameState, seat: Seat): Command | null {
  const script = HANDS[seat];
  const buys = RIVAL_BUYS[seat];
  if (!script || !buys) return null;

  const decision = state.merger?.pending ?? state.motion?.pending ?? null;
  if (decision && decision.seat === seat) {
    switch (decision.type) {
      case 'cast-vote':
        return { type: 'cast-vote', seat, inFavour: true };
      case 'dispose-shares':
        return { type: 'dispose-shares', seat, hold: 0, sell: decision.shares, trade: 0 };
      default:
        return null;
    }
  }

  const hand = state.hands[seat]!;
  // Each rival plays its first two dealt tiles, one a turn.
  const played = script.slice(0, 2).filter((tile) => !hand.includes(tile)).length;

  switch (state.step) {
    case 'place': {
      const tile = script.slice(0, 2).find((t) => hand.includes(t));
      return tile ? { type: 'place-tile', seat, tile } : null;
    }
    case 'found': {
      const industry = INDUSTRIES.find((i) => !state.corporations[i].founded);
      const group = state.pendingFound?.group;
      return industry && group ? { type: 'found-corporation', seat, industry, hqTile: group.includes(RIVAL_FOUNDING) ? RIVAL_FOUNDING : group[0]! } : null;
    }
    case 'buy': {
      const picks: Partial<Record<Industry, number>> = {};
      let cash = state.seats[seat]!.cash;
      for (const pick of buys[played - 1] ?? []) {
        const industry =
          pick === 'yours' ? companyAt(state, YOUR_FOUNDING) : pick === 'theirs' ? companyAt(state, RIVAL_FOUNDING) : pick;
        const price = industry ? sharePriceOf(state, industry) : null;
        // A share the rival can't afford is skipped, never retried.
        if (!industry || price == null || price > cash) continue;
        cash -= price;
        picks[industry] = (picks[industry] ?? 0) + 1;
      }
      return { type: 'buy-shares', seat, picks };
    }
    case 'end-check':
      return { type: 'end-turn', seat };
    default:
      return null;
  }
}

// --- your side: the steps the host walks you through -----------------------

export type Step =
  | 'welcome'
  | 'place'
  | 'found'
  | 'buy'
  | 'rivals'
  | 'grow'
  | 'buyMore'
  | 'rivalsAgain'
  | 'merge'
  | 'merger'
  | 'dispose'
  | 'safe'
  | 'motion'
  | 'vote'
  | 'over';

/** Which step the table is on, read off the client's own state. */
export function stepOf(state: GameClientState, welcomed: boolean): Step {
  const view = state.views[YOU];
  if (!view) return 'welcome';
  if (view.status === 'over' || state.status === 'over') return 'over';
  if (!welcomed) return 'welcome';
  if (view.motion) return 'vote';
  if (state.pendingDecision?.seat === YOU && state.pendingDecision.type === 'dispose-shares') return 'dispose';

  const placed = state.log.filter((event) => event.type === 'tile-placed' && event.seat === YOU).length;
  if (view.activeSeat !== YOU) {
    if (view.step === 'merge') return 'merger';
    return placed <= 1 ? 'rivals' : 'rivalsAgain';
  }
  switch (view.step) {
    case 'place':
      return placed === 0 ? 'place' : placed === 1 ? 'grow' : 'merge';
    case 'found':
      return 'found';
    case 'merge':
      return 'merger';
    case 'buy':
      return placed <= 1 ? 'buy' : placed === 2 ? 'buyMore' : 'safe';
    case 'end-check':
      return 'motion';
    default:
      return 'rivals';
  }
}

/** The tile the host points at on a step, if any. */
export function hintTile(step: Step): TileId | null {
  switch (step) {
    case 'place':
      return YOUR_TILES[0];
    case 'grow':
      return YOUR_TILES[1];
    case 'merge':
      return YOUR_TILES[2];
    default:
      return null;
  }
}

/**
 * Whether a step accepts one of your commands. Anything off the script is
 * turned away before it reaches the engine, and the host repeats the ask.
 */
export function allows(step: Step, command: Command, state: GameClientState): boolean {
  if (command.seat !== YOU) return true;
  switch (step) {
    case 'welcome':
      return false;
    case 'place':
    case 'grow':
    case 'merge':
      return command.type === 'place-tile' && command.tile === hintTile(step);
    case 'buy': {
      // At least one share of your new company, so you hold the most of it.
      if (command.type !== 'buy-shares') return true;
      const yours = state.views[YOU] ? companyAt(state.views[YOU], YOUR_FOUNDING) : null;
      return yours != null && (command.picks[yours] ?? 0) > 0;
    }
    case 'motion':
      return command.type === 'move-to-liquidate';
    default:
      return true;
  }
}

/** The industries the host names: the company you founded, and the one that takes it over. */
export function companiesOf(state: GameClientState): { yours: Industry | null; theirs: Industry } {
  const view = state.views[YOU];
  let yours = view ? companyAt(view, YOUR_FOUNDING) : null;
  if (yours === 'tech') {
    // After the takeover 7F is Tech's; your company is the one Tech ate.
    yours = view?.corporations.tech.eaten.at(-1)?.industry ?? null;
  }
  return { yours, theirs: 'tech' };
}
