import type { Command } from './commands.js';
import type { EngineEvent } from './events.js';
import { INDUSTRIES, type Industry } from './pool.js';
import type { GameState, RankingRow, Seat } from './state.js';

/**
 * The end-of-game superlatives (#69).
 *
 * Every one is a fold over the command log — the same pass `retrospective()`
 * makes — so they need no stored state and replay identically. The engine
 * decides *who* and *how many*; not one word of the voice lives here. The
 * prose is `apps/desktop/src/copy/constants.json`, keyed by `AwardId`, because
 * copy lives in one file and an engine that knows a joke is an engine that has
 * to be rebuilt to change one.
 *
 * Three rules hold for all of them:
 *
 * - **Nobody earned it, it does not appear.** Never "Synergies Realised:
 *   nobody, 0". Each award states its own floor.
 * - **Ties share.** `seats` is a list. No tie is broken by anything the engine
 *   would have to invent, because a replay has to produce the same awards and
 *   there is no randomness under this package to break one with.
 * - **Four are Boomtown's own.** The motion, the vote and the announced end
 *   do not exist at a table playing the published editions, so those four are
 *   skipped rather than awarded to nobody.
 */
export type AwardId =
  // money
  | 'synergies-realised'
  | 'right-place-right-collapse'
  | 'professional-mourner'
  | 'fire-sale-enthusiast'
  | 'money-was-no-object'
  | 'cash-is-a-position'
  // stock
  | 'paper-baron'
  | 'buy-high-buy-often'
  | 'all-eggs-one-basket'
  | 'a-little-of-everything'
  // mergers and destruction
  | 'rug-puller'
  | 'too-big-to-fail'
  | 'serial-entrepreneur'
  | 'sentimental-value'
  | 'took-the-money'
  | 'strictly-a-passenger'
  // the board
  | 'zoning-issues'
  | 'quietly-developing-the-suburbs'
  // Boomtown only
  | 'called-last-orders'
  | 'shareholder-activist'
  | 'showed-everyone-their-hand'
  | 'institutional-investor';

export interface Award {
  readonly id: AwardId;
  /** Ascending. More than one seat means they share it. */
  readonly seats: readonly Seat[];
  /** The number the copy prints. */
  readonly value: number;
  /** A second number, where the line needs one ("6 of 12 shares"). */
  readonly of?: number;
  /** The corporation the award is *about*, where there is one — what tints it. */
  readonly industry?: Industry;
}

interface Best {
  value: number;
  industry?: Industry | undefined;
}

/** Per-seat counters, all of them derived, none of them stored between games. */
export interface AwardLedger {
  readonly seatCount: number;
  readonly boomtown: boolean;
  readonly kills: number[];
  readonly bonusTotal: number[];
  readonly biggestBonus: Best[];
  readonly biggestProceeds: Best[];
  readonly spent: number[];
  readonly sharesBought: number[];
  readonly held: number[];
  readonly sold: number[];
  readonly founded: number[];
  readonly biggestBuilt: Best[];
  readonly rugPull: Best[];
  readonly deadSwept: number[];
  readonly quietTiles: number[];
  readonly motions: number[];
  readonly heaviestVote: number[];
  endAnnouncedBy: Seat | null;
  booksOpened: Seat[];
  /** Who founded each corporation's current incarnation. A refounding replaces it. */
  readonly founderOf: Map<Industry, Seat>;
  /** The seat whose tile started the merger being resolved. */
  mergemaker: Seat | null;
  /** Shares disposed of per seat in the defunct chain currently being resolved. */
  readonly disposals: Map<Industry, number[]>;
  /** Holdings at settlement, before the bank buys everything back. */
  finalHoldings: Record<Industry, number>[] | null;
  finalRankings: readonly RankingRow[] | null;
}

const zeros = (n: number): number[] => Array.from({ length: n }, () => 0);
const bests = (n: number): Best[] => Array.from({ length: n }, () => ({ value: 0 }));

export function newAwardLedger(initial: GameState): AwardLedger {
  const n = initial.seats.length;
  return {
    seatCount: n,
    // The four Boomtown-only awards key off machinery the published editions
    // do not have. `endVote` is what the preset actually turns on, so it is
    // what decides, rather than the preset's name.
    boomtown: initial.ruleset.endVote !== undefined,
    kills: zeros(n),
    bonusTotal: zeros(n),
    biggestBonus: bests(n),
    biggestProceeds: bests(n),
    spent: zeros(n),
    sharesBought: zeros(n),
    held: zeros(n),
    sold: zeros(n),
    founded: zeros(n),
    biggestBuilt: bests(n),
    rugPull: bests(n),
    deadSwept: zeros(n),
    quietTiles: zeros(n),
    motions: zeros(n),
    heaviestVote: zeros(n),
    endAnnouncedBy: null,
    booksOpened: [],
    founderOf: new Map(),
    mergemaker: null,
    disposals: new Map(),
    finalHoldings: null,
    finalRankings: null,
  };
}

/**
 * Fold one accepted command and the events it produced.
 *
 * Attribution is the whole difficulty here, and it is why this takes the
 * command as well as the events: `corporation-founded`, `corporation-grew` and
 * `merger-started` describe what happened to a *company* and carry no seat
 * (`packages/engine/src/events.ts`). The seat comes from the command, or from
 * the `tile-placed` event beside them — and for anything that lands in a
 * *later* command of the same merger, from the mergemaker remembered when the
 * merger started.
 */
export function observeForAwards(
  ledger: AwardLedger,
  command: Command,
  events: readonly EngineEvent[],
): void {
  const placer = events.find((event) => event.type === 'tile-placed')?.seat ?? null;

  for (const event of events) {
    switch (event.type) {
      case 'tile-placed':
        if (event.outcome === 'nothing') ledger.quietTiles[event.seat]! += 1;
        break;

      case 'dead-tiles-swept':
        ledger.deadSwept[event.seat]! += event.tiles.length;
        break;

      case 'corporation-founded': {
        // The founder is whoever asked for it; a refounding replaces the
        // record, because "the founder" of a name that has come back is
        // whoever brought it back (#69, the Rug-Puller wrinkle).
        const seat = command.type === 'found-corporation' ? command.seat : placer;
        if (seat !== null) {
          ledger.founded[seat]! += 1;
          ledger.founderOf.set(event.industry, seat);
          bump(ledger.biggestBuilt[seat]!, event.tiles.length, event.industry);
        }
        break;
      }

      case 'corporation-grew': {
        const seat = placer ?? ledger.mergemaker;
        if (seat !== null) bump(ledger.biggestBuilt[seat]!, event.newSize, event.industry);
        break;
      }

      case 'merger-started':
        ledger.mergemaker = placer;
        ledger.disposals.clear();
        break;

      case 'bonus-paid':
        for (const payout of event.payouts) {
          if (payout.seat < 0 || payout.seat >= ledger.seatCount) continue;
          ledger.bonusTotal[payout.seat]! += payout.amount;
          bump(ledger.biggestBonus[payout.seat]!, payout.amount, event.defunct);
        }
        break;

      case 'shares-disposed': {
        // These are the engine's own events, never a redacted copy, so the
        // counts are always present here. The nulls in `EngineEvent` belong to
        // what a *client* is handed (#60), and this never runs on that.
        ledger.held[event.seat]! += event.hold ?? 0;
        ledger.sold[event.seat]! += event.sell ?? 0;
        bump(ledger.biggestProceeds[event.seat]!, event.proceeds ?? 0, event.defunct);
        const total = (event.hold ?? 0) + (event.sell ?? 0) + (event.trade ?? 0);
        const per = ledger.disposals.get(event.defunct) ?? zeros(ledger.seatCount);
        per[event.seat]! += total;
        ledger.disposals.set(event.defunct, per);
        break;
      }

      case 'corporation-defunct': {
        const killer = ledger.mergemaker;
        if (killer !== null) ledger.kills[killer]! += 1;
        // A rug pull is founding it, letting everyone buy in, and then being
        // the one who pulls the floor out — ranked by what the others were
        // left holding, which is the size of the rug. Without that last
        // clause it is just merging away a company nobody else touched.
        const founder = ledger.founderOf.get(event.industry);
        const disposed = ledger.disposals.get(event.industry) ?? zeros(ledger.seatCount);
        const victims = disposed.reduce((sum, n, seat) => (seat === founder ? sum : sum + n), 0);
        if (killer !== null && founder === killer && victims > 0) {
          bump(ledger.rugPull[killer]!, victims, event.industry);
        }
        ledger.founderOf.delete(event.industry);
        break;
      }

      case 'merger-completed':
        ledger.mergemaker = null;
        break;

      case 'shares-bought': {
        ledger.spent[event.seat]! += event.cost ?? 0;
        for (const industry of INDUSTRIES) ledger.sharesBought[event.seat]! += event.picks[industry] ?? 0;
        break;
      }

      case 'motion-raised':
        ledger.motions[event.seat]! += 1;
        break;

      case 'vote-cast':
        ledger.heaviestVote[event.seat] = Math.max(ledger.heaviestVote[event.seat]!, event.weight);
        break;

      case 'books-opened':
        ledger.booksOpened = [...event.seats].sort((a, b) => a - b);
        break;

      case 'end-announced':
        ledger.endAnnouncedBy = event.seat;
        break;

      case 'game-over':
        // Settlement zeroes every holding, so the last chance to see what
        // anyone actually held is the result it hands back on the way out.
        ledger.finalRankings = event.result.rankings;
        ledger.finalHoldings = Array.from({ length: ledger.seatCount }, emptyTally);
        for (const row of event.result.rankings) {
          for (const entry of row.holdings) ledger.finalHoldings[row.seat]![entry.industry] = entry.shares;
        }
        break;

      default:
        break;
    }
  }
}

const emptyTally = (): Record<Industry, number> =>
  Object.fromEntries(INDUSTRIES.map((i) => [i, 0])) as Record<Industry, number>;

function bump(best: Best, value: number, industry?: Industry): void {
  if (value > best.value) {
    best.value = value;
    best.industry = industry;
  }
}

/** Every seat holding the maximum, ascending, or none when the floor is not met. */
function leaders(values: readonly number[], floor = 1): Seat[] {
  const top = Math.max(...values);
  if (!Number.isFinite(top) || top < floor) return [];
  return values.flatMap((value, seat) => (value === top ? [seat] : []));
}

export function awardsFrom(ledger: AwardLedger): readonly Award[] {
  const out: Award[] = [];
  const add = (
    id: AwardId,
    seats: readonly Seat[],
    value: number,
    extra?: { of?: number | undefined; industry?: Industry | undefined },
  ): void => {
    if (seats.length === 0 || seats.length === ledger.seatCount) return;
    out.push({
      id,
      seats,
      value,
      ...(extra?.of === undefined ? {} : { of: extra.of }),
      ...(extra?.industry === undefined ? {} : { industry: extra.industry }),
    });
  };

  // A superlative everybody ties on says nothing about anybody, which is why
  // `add` drops a whole-table tie as well as an empty one.
  const byBest = (id: AwardId, best: readonly Best[], floor = 1): void => {
    const seats = leaders(best.map((b) => b.value), floor);
    const top = seats[0];
    add(id, seats, top === undefined ? 0 : best[top]!.value, { industry: top === undefined ? undefined : best[top]!.industry });
  };

  // --- money ---------------------------------------------------------------
  add('synergies-realised', leaders(ledger.kills), Math.max(...ledger.kills));
  byBest('right-place-right-collapse', ledger.biggestBonus);
  add('professional-mourner', leaders(ledger.bonusTotal), Math.max(...ledger.bonusTotal));
  byBest('fire-sale-enthusiast', ledger.biggestProceeds);
  add('money-was-no-object', leaders(ledger.spent), Math.max(...ledger.spent));

  // The only award won by the lowest number, so it needs its own floor: at a
  // table where nobody bought anything it is not a character trait.
  if (ledger.spent.some((n) => n > 0)) {
    const least = Math.min(...ledger.spent);
    add('cash-is-a-position', ledger.spent.flatMap((n, seat) => (n === least ? [seat] : [])), least);
  }

  // --- stock ---------------------------------------------------------------
  const holdings = ledger.finalHoldings;
  if (holdings) {
    const totals = holdings.map((h) => INDUSTRIES.reduce((sum, i) => sum + h[i], 0));
    add('paper-baron', leaders(totals), Math.max(...totals));

    // Concentration only means something with a position to concentrate. Both
    // of these read the same holdings from opposite ends, so a seat holding
    // one company's stock and nothing else can win either — which is correct,
    // and funnier when it is the same seat.
    const concentration = holdings.map((h, seat) => (totals[seat]! >= 3 ? Math.max(...INDUSTRIES.map((i) => h[i])) : 0));
    const focus = leaders(concentration, 2);
    const who = focus[0];
    if (who !== undefined) {
      const industry = INDUSTRIES.find((i) => holdings[who]![i] === concentration[who]);
      add('all-eggs-one-basket', focus, concentration[who]!, { of: totals[who], industry });
    }

    const spread = holdings.map((h, seat) => (totals[seat]! >= 3 ? INDUSTRIES.filter((i) => h[i] > 0).length : 0));
    add('a-little-of-everything', leaders(spread, 3), Math.max(...spread));
  }
  add('buy-high-buy-often', leaders(ledger.sharesBought), Math.max(...ledger.sharesBought));

  // --- mergers and destruction --------------------------------------------
  byBest('rug-puller', ledger.rugPull);
  byBest('too-big-to-fail', ledger.biggestBuilt, 2);
  add('serial-entrepreneur', leaders(ledger.founded), Math.max(...ledger.founded));
  add('sentimental-value', leaders(ledger.held), Math.max(...ledger.held));
  add('took-the-money', leaders(ledger.sold), Math.max(...ledger.sold));

  // An anti-superlative, and the one that can insult somebody, so it is
  // fenced: founded nothing, and still finished in the top half.
  const rankings = ledger.finalRankings;
  if (rankings && rankings.length > 0) {
    const half = Math.ceil(rankings.length / 2);
    const passengers = rankings
      .slice(0, half)
      .map((row) => row.seat)
      .filter((seat) => ledger.founded[seat] === 0)
      .sort((a, b) => a - b);
    const place = passengers.length > 0 ? rankings.findIndex((row) => row.seat === passengers[0]) + 1 : 0;
    add('strictly-a-passenger', passengers, place);
  }

  // --- the board -----------------------------------------------------------
  add('zoning-issues', leaders(ledger.deadSwept), Math.max(...ledger.deadSwept));
  add('quietly-developing-the-suburbs', leaders(ledger.quietTiles, 2), Math.max(...ledger.quietTiles));

  // --- Boomtown's own ------------------------------------------------------
  if (ledger.boomtown) {
    if (ledger.endAnnouncedBy !== null) add('called-last-orders', [ledger.endAnnouncedBy], 1);
    add('shareholder-activist', leaders(ledger.motions), Math.max(...ledger.motions));
    add('showed-everyone-their-hand', ledger.booksOpened, ledger.booksOpened.length);
    add('institutional-investor', leaders(ledger.heaviestVote), Math.max(...ledger.heaviestVote));
  }

  return out;
}
