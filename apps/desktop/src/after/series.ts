import { holderRanks, type Industry, type Retrospective, type Seat } from '@boomtown/engine';

/**
 * Everything the after-game charts read, derived once from the record the
 * authority sent (#68). Pure functions over plain arrays, so the components
 * are drawing and nothing else — and so the awkward parts (a company that came
 * back, a tie for largest holder) are testable without a browser.
 *
 * Every series is indexed by *turn index*, which is the record's own index:
 * `turns[i].turn === i`, 0 being the deal and the last being settlement.
 */

/**
 * A seat's line, by its position in the seating order. Six patterns, fixed
 * table-wide, because the colour on these charts belongs to the companies:
 * a palette that is both colourblind-safe and clear of the seven corporation
 * hues does not exist at six seats (`design/build.py`, the After artboard's
 * findings). So the seat is the dash, the company is the hue.
 */
export const SEAT_DASH = ['', '7 4', '1.5 3.5', '10 3.5 1.5 3.5', '16 5', '1.5 3.5 7 3.5'] as const;

export const dashFor = (seat: Seat): string => SEAT_DASH[seat % SEAT_DASH.length] ?? '';

/** One seat's net worth across the whole game. */
export function netWorthSeries(record: Retrospective, seat: Seat): number[] {
  return record.turns.map((turn) => turn.seats[seat]?.netWorth ?? 0);
}

/** What every share of a company in play was worth, per turn. */
export function companyValueSeries(record: Retrospective, industry: Industry): number[] {
  return record.turns.map((turn) =>
    turn.seats.reduce((sum, seat) => sum + seat.holdings[industry] * turn.corps[industry].price, 0),
  );
}

/** What one seat's holding in one company was worth, per turn. */
export function seatValueSeries(record: Retrospective, industry: Industry, seat: Seat): number[] {
  return record.turns.map((turn) => (turn.seats[seat]?.holdings[industry] ?? 0) * turn.corps[industry].price);
}

export interface Span {
  readonly from: number;
  readonly to: number;
}

/**
 * The turns a company was on the board, as one span per life. A name that was
 * refounded has two, and the gap between them is drawn as a gap rather than as
 * a line dragged across the years it did not exist.
 */
export function liveSpans(record: Retrospective, industry: Industry): Span[] {
  const spans: Span[] = [];
  let open: number | null = null;
  record.turns.forEach((turn, index) => {
    const live = turn.corps[industry].live;
    if (live && open === null) open = index;
    if (!live && open !== null) {
      spans.push({ from: open, to: index - 1 });
      open = null;
    }
  });
  if (open !== null) spans.push({ from: open, to: record.turns.length - 1 });
  return spans;
}

/** True when this company never came out of the pool. */
export const neverFounded = (record: Retrospective, industry: Industry): boolean =>
  record.turns.every((turn) => !turn.corps[industry].live);

/** Founded companies in the order they first appeared — the carousel's running order. */
export function foundedCompanies(record: Retrospective, all: readonly Industry[]): Industry[] {
  const order = new Map<Industry, number>();
  for (const event of record.companies) {
    if (event.kind !== 'folded' && !order.has(event.industry)) order.set(event.industry, event.turn);
  }
  return all.filter((industry) => order.has(industry)).sort((a, b) => order.get(a)! - order.get(b)!);
}

export interface HolderRun {
  readonly from: number;
  readonly to: number;
  readonly seats: readonly Seat[];
}

/**
 * Who the two bonuses would pay, turn by turn, collapsed into runs.
 *
 * Runs rather than cells: a reader wants the tenure, not forty-six repetitions
 * of a name. Ties come back whole (`holderRanks` keeps them, by the rules'
 * own tie handling) and a turn nobody holds any is left out entirely, which is
 * what puts a gap in the lane while the company is off the board.
 */
export function holderRuns(record: Retrospective, industry: Industry, lane: 0 | 1): HolderRun[] {
  const runs: HolderRun[] = [];
  record.turns.forEach((turn, index) => {
    const shares = turn.seats.map((seat) => seat.holdings[industry]);
    const ranks = holderRanks(turn.corps[industry].live ? shares : shares.map(() => 0));
    const seats = lane === 0 ? ranks.largest : ranks.second;
    const last = runs[runs.length - 1];
    if (seats.length === 0) return;
    if (last && last.to === index - 1 && same(last.seats, seats)) {
      runs[runs.length - 1] = { from: last.from, to: index, seats: last.seats };
      return;
    }
    runs.push({ from: index, to: index, seats });
  });
  return runs;
}

const same = (a: readonly Seat[], b: readonly Seat[]): boolean =>
  a.length === b.length && a.every((seat, index) => seat === b[index]);

/**
 * The turns the majority changed hands. A tie holds the incumbent: nobody took
 * it off anyone, so nothing changed hands — which is the reading the word
 * asks for, not the rule the bonus is paid by.
 */
export function leadChanges(record: Retrospective, industry: Industry): number[] {
  const turns: number[] = [];
  let holder: Seat | null = null;
  record.turns.forEach((turn, index) => {
    if (!turn.corps[industry].live) return;
    const { largest } = holderRanks(turn.seats.map((seat) => seat.holdings[industry]));
    if (largest.length !== 1) return;
    const next = largest[0]!;
    if (holder !== null && holder !== next) turns.push(index);
    holder = next;
  });
  return turns;
}

/** A round number at or above `value`, for an axis that is not quite the data's edge. */
export function niceMax(value: number, step: number): number {
  if (value <= 0) return step;
  return Math.ceil(value / step) * step;
}

/** `M x y L x y …` for a series, dropping nothing — the caller slices first. */
export function linePath(points: readonly (readonly [number, number])[]): string {
  return points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
}
