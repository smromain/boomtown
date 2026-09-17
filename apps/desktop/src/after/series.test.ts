import { describe, expect, it } from 'vitest';
import { INDUSTRIES, type Industry, type Retrospective } from '@boomtown/engine';
import {
  companyValueSeries,
  dashFor,
  foundedCompanies,
  gridLines,
  moneyAxis,
  holderRuns,
  leadChanges,
  liveSpans,
  neverFounded,
  netWorthSeries,
  niceMax,
  placeLabels,
  seatValueSeries,
} from './series.js';

/**
 * A record built by hand rather than played out: every case worth testing here
 * — a company that comes back, a tie for largest holder, a turn nobody holds
 * any — takes twenty turns to reach legitimately and one line to write down.
 */
function record(turns: { books: { size: number; price: number }; held: number[][] }[]): Retrospective {
  const zeroes = () => Object.fromEntries(INDUSTRIES.map((i) => [i, 0])) as Record<Industry, number>;
  return {
    complete: true,
    settled: false,
    companies: [],
    awards: [],
    turns: turns.map((turn, index) => ({
      turn: index,
      seats: turn.held.map((holdings, seat) => ({
        cash: 1000 * (seat + 1),
        holdings: { ...zeroes(), books: holdings[0] ?? 0 },
        netWorth: 1000 * (seat + 1) + (holdings[0] ?? 0) * turn.books.price,
      })),
      corps: Object.fromEntries(
        INDUSTRIES.map((industry) => [
          industry,
          industry === 'books'
            ? { live: turn.books.size > 0, size: turn.books.size, price: turn.books.price }
            : { live: false, size: 0, price: 0 },
        ]),
      ) as Retrospective['turns'][number]['corps'],
    })),
  };
}

const dead = { size: 0, price: 0 };
const live = (size: number, price: number) => ({ size, price });

describe('liveSpans', () => {
  it('is one span for a company that was founded and stayed', () => {
    const r = record([
      { books: dead, held: [[0], [0]] },
      { books: live(2, 200), held: [[1], [0]] },
      { books: live(3, 300), held: [[1], [2]] },
    ]);
    expect(liveSpans(r, 'books')).toEqual([{ from: 1, to: 2 }]);
  });

  it('is two spans for a name that came back, with the gap between them', () => {
    const r = record([
      { books: live(2, 200), held: [[1], [0]] },
      { books: dead, held: [[1], [0]] },
      { books: dead, held: [[1], [0]] },
      { books: live(2, 200), held: [[1], [1]] },
    ]);
    expect(liveSpans(r, 'books')).toEqual([
      { from: 0, to: 0 },
      { from: 3, to: 3 },
    ]);
  });

  it('is empty for a company that never came out of the pool', () => {
    const r = record([{ books: dead, held: [[0], [0]] }]);
    expect(liveSpans(r, 'books')).toEqual([]);
    expect(neverFounded(r, 'books')).toBe(true);
    expect(neverFounded(r, 'video')).toBe(true);
  });
});

describe('holderRuns', () => {
  const r = record([
    { books: live(2, 200), held: [[3], [1]] },
    { books: live(2, 200), held: [[3], [1]] },
    { books: live(3, 300), held: [[3], [3]] },
    { books: live(3, 300), held: [[2], [4]] },
  ]);

  it('collapses consecutive turns with the same answer into one run', () => {
    expect(holderRuns(r, 'books', 0)).toEqual([
      { from: 0, to: 1, seats: [0] },
      { from: 2, to: 2, seats: [0, 1] },
      { from: 3, to: 3, seats: [1] },
    ]);
  });

  it('keeps a tie as a tie rather than breaking it', () => {
    expect(holderRuns(r, 'books', 0)[1]!.seats).toEqual([0, 1]);
  });

  it('leaves the second lane empty on the turn the two are level', () => {
    // the tie for largest takes both seats, so nobody is second that turn
    const second = holderRuns(r, 'books', 1);
    expect(second.some((run) => run.from <= 2 && run.to >= 2)).toBe(false);
  });

  it('holds no run at all while the company is off the board', () => {
    const gone = record([
      { books: live(2, 200), held: [[2], [1]] },
      { books: dead, held: [[2], [1]] },
    ]);
    expect(holderRuns(gone, 'books', 0)).toEqual([{ from: 0, to: 0, seats: [0] }]);
  });
});

describe('leadChanges', () => {
  it('counts the turns the majority actually changed hands', () => {
    const r = record([
      { books: live(2, 200), held: [[3], [1]] },
      { books: live(2, 200), held: [[3], [5]] },
      { books: live(2, 200), held: [[6], [5]] },
    ]);
    expect(leadChanges(r, 'books')).toEqual([1, 2]);
  });

  it('holds the incumbent through a tie — nobody took it off anyone', () => {
    const r = record([
      { books: live(2, 200), held: [[3], [1]] },
      { books: live(2, 200), held: [[3], [3]] },
      { books: live(2, 200), held: [[4], [3]] },
    ]);
    expect(leadChanges(r, 'books')).toEqual([]);
  });
});

describe('the series the charts read', () => {
  const r = record([
    { books: live(2, 200), held: [[2], [1]] },
    { books: live(3, 300), held: [[2], [3]] },
  ]);

  it('values a seat’s holding at that turn’s price', () => {
    expect(seatValueSeries(r, 'books', 0)).toEqual([400, 600]);
    expect(seatValueSeries(r, 'books', 1)).toEqual([200, 900]);
  });

  it('values the company at what every share of it in play was worth', () => {
    expect(companyValueSeries(r, 'books')).toEqual([600, 1500]);
  });

  it('reads net worth straight off the record, since settlement wrote it', () => {
    expect(netWorthSeries(r, 0)).toEqual([1400, 1600]);
  });
});

describe('the small pieces', () => {
  it('gives every seat its own dash and wraps past six', () => {
    expect(new Set([0, 1, 2, 3, 4, 5].map(dashFor)).size).toBe(6);
    expect(dashFor(6)).toBe(dashFor(0));
  });

  it('rounds an axis up to something a reader can price', () => {
    expect(niceMax(13_300, 5000)).toBe(15_000);
    expect(niceMax(0, 2000)).toBe(2000);
  });

  it('keeps the gridlines countable however long the game ran', () => {
    // a fixed $5,000 step is four lines on a short game and eleven on a long one
    expect(gridLines(15_000)).toEqual([5000, 10_000, 15_000]);
    for (const max of [3000, 15_000, 60_000, 250_000]) {
      expect(gridLines(max).length, `${max}`).toBeLessThanOrEqual(6);
      expect(gridLines(max).length, `${max}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('starts a money axis below the lowest point, not at nothing', () => {
    // every seat starts on the same dealt cash, so a zero baseline spends its
    // bottom third on a band nobody is ever in
    const axis = moneyAxis(6000, 17_300);
    expect(axis.floor).toBe(5000);
    expect(axis.max).toBeGreaterThanOrEqual(17_300);
    expect(axis.lines.length).toBeLessThanOrEqual(6);
    expect(axis.lines.every((line) => line > axis.floor)).toBe(true);
  });

  it('never puts the floor below nothing', () => {
    expect(moneyAxis(200, 900).floor).toBeGreaterThanOrEqual(0);
  });

  it('lays a label in the first row it clears, and drops one that clears none', () => {
    const items = [
      { x: 100, width: 60 },
      { x: 110, width: 60 },
      { x: 120, width: 60 },
      { x: 130, width: 60 },
      { x: 400, width: 60 },
    ];
    const placed = placeLabels(items, 3);
    expect(placed.map((entry) => entry.index)).toEqual([0, 1, 2, 4]);
    expect(placed.map((entry) => entry.row)).toEqual([0, 1, 2, 0]);
  });

  it('orders the carousel by when each company first appeared', () => {
    const r: Retrospective = {
      ...record([{ books: dead, held: [[0], [0]] }]),
      companies: [
        { turn: 4, industry: 'video', kind: 'founded' },
        { turn: 1, industry: 'books', kind: 'founded' },
        { turn: 6, industry: 'books', kind: 'refounded' },
        { turn: 5, industry: 'books', kind: 'folded', into: 'video' },
      ],
    };
    expect(foundedCompanies(r, INDUSTRIES)).toEqual(['books', 'video']);
  });
});
