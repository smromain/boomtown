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

const STEPS = [500, 1000, 2000, 5000, 10_000, 20_000, 50_000, 100_000];

/**
 * Gridlines a reader can count. A fixed $5,000 step is four lines on a short
 * game and eleven on a long one, and eleven is a ruled page rather than a
 * chart — so the step comes from the range, aiming for five or so.
 */
export function gridLines(max: number): number[] {
  const step = STEPS.find((candidate) => max / candidate <= 6) ?? STEPS[STEPS.length - 1]!;
  const lines: number[] = [];
  for (let value = step; value <= max; value += step) lines.push(value);
  return lines;
}

export interface Axis {
  readonly floor: number;
  readonly max: number;
  readonly lines: readonly number[];
}

/**
 * A money axis over a range that does not start at nothing.
 *
 * Every seat starts the game on the same dealt cash and only climbs from
 * there, so an axis anchored at zero spends its bottom third on a band nobody
 * is ever in and squeezes the whole game into the top. This one starts at a
 * round number below the lowest point instead — which is a truncated axis, and
 * so it is only ever used for a *line*, where the shape is the reading, and
 * every gridline is labelled with what it is.
 */
export function moneyAxis(low: number, high: number): Axis {
  const span = Math.max(1, high - low);
  const step = STEPS.find((candidate) => span / candidate <= 5) ?? STEPS[STEPS.length - 1]!;
  const floor = Math.max(0, Math.floor(low / step) * step);
  const max = Math.ceil(high / step) * step;
  const lines: number[] = [];
  for (let value = floor + step; value <= max; value += step) lines.push(value);
  return { floor, max, lines };
}

export interface PlacedLabel {
  readonly index: number;
  readonly x: number;
  readonly row: number;
}

/**
 * Lay labels along an axis in as many rows as it takes, dropping any that will
 * not fit at all.
 *
 * Two alternating rows is the usual trick and it holds until a game runs long
 * enough to found, fold and refound around the same few turns — then three
 * labels land on top of each other and the row reads "FOLDEFOLDED". Here each
 * label takes the first row it clears, and one that clears none is left to its
 * marker and its hover text, which is better than printing it over its
 * neighbour.
 */
export function placeLabels(
  items: readonly { x: number; width: number }[],
  rows: number,
  gap = 6,
): PlacedLabel[] {
  const ends: number[] = Array.from({ length: rows }, () => -Infinity);
  const placed: PlacedLabel[] = [];
  items.forEach((item, index) => {
    const row = ends.findIndex((end) => item.x - item.width / 2 >= end + gap);
    if (row < 0) return;
    ends[row] = item.x + item.width / 2;
    placed.push({ index, x: item.x, row });
  });
  return placed;
}

/** `M x y L x y …` for a series, dropping nothing — the caller slices first. */
export function linePath(points: readonly (readonly [number, number])[]): string {
  return points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
}
