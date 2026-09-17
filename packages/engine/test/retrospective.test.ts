import { describe, expect, it } from 'vitest';
import {
  INDUSTRIES,
  boomtown,
  classic,
  createGame,
  holderRanks,
  legalMoves,
  reduce,
  retrospective,
  type Command,
  type GameState,
  type Ruleset,
} from '@boomtown/engine';

/**
 * A whole game, played by a rule rather than by a person: take the last legal
 * move offered, except announce the end the moment it is offered. It is not a
 * good player, but it is a *reproducible* one — no `Math.random` anywhere near
 * the engine — and it produces the one thing these tests need, which is a real
 * command log with mergers, foundings and a settlement in it.
 */
function playOut(ruleset: Ruleset, seed: number, seats = 3): { initial: GameState; log: Command[] } {
  const initial = createGame({
    seats: Array.from({ length: seats }, (_, i) => ({ name: `P${i}` })),
    seed,
    ruleset,
    turnOrder: Array.from({ length: seats }, (_, i) => i),
  });
  const log: Command[] = [];
  let state = initial;
  for (let step = 0; step < 6000 && state.status === 'playing'; step += 1) {
    const moves = legalMoves(state);
    if (moves.length === 0) break;
    const command = moves.find((move) => move.type === 'announce-end') ?? moves[moves.length - 1]!;
    const result = reduce(state, command);
    if (!result.ok) throw new Error(`driver produced an illegal move: ${result.error.code}`);
    log.push(command);
    state = result.state;
  }
  return { initial, log };
}

describe('holderRanks', () => {
  it('ranks by shares held, ascending seats within a level', () => {
    expect(holderRanks([2, 5, 5, 1])).toEqual({ largest: [1, 2], second: [0] });
  });

  it('a tie for largest pushes the next holder *down* into second (docs/rules.md, Bonus ties)', () => {
    expect(holderRanks([4, 4, 3])).toEqual({ largest: [0, 1], second: [2] });
  });

  it('ignores seats holding nothing', () => {
    expect(holderRanks([0, 0, 3])).toEqual({ largest: [2], second: [] });
  });

  it('is empty when nobody holds any', () => {
    expect(holderRanks([0, 0, 0])).toEqual({ largest: [], second: [] });
  });
});

describe('retrospective', () => {
  const { initial, log } = playOut(boomtown, 20250917);

  it('replays the log cleanly', () => {
    const record = retrospective(initial, log);
    expect(record.complete).toBe(true);
    expect(log.length).toBeGreaterThan(20);
  });

  it('is a pure function of the log — two builds are identical', () => {
    expect(retrospective(initial, log)).toEqual(retrospective(initial, log));
  });

  it('numbers turns from the deal, one per turn, with no gaps', () => {
    const { turns } = retrospective(initial, log);
    expect(turns[0]!.turn).toBe(0);
    turns.forEach((record, index) => expect(record.turn).toBe(index));
  });

  it('starts every seat on the dealt cash and no stock', () => {
    const { turns } = retrospective(initial, log);
    for (const seat of turns[0]!.seats) {
      expect(seat.netWorth).toBe(seat.cash);
      for (const industry of INDUSTRIES) expect(seat.holdings[industry]).toBe(0);
    }
  });

  it('ends on the settled totals, so the graph and the standings agree', () => {
    const record = retrospective(initial, log);
    let state = initial;
    for (const command of log) {
      const result = reduce(state, command);
      if (!result.ok) throw new Error('log did not replay');
      state = result.state;
    }
    expect(state.status).toBe('over');
    const last = record.turns[record.turns.length - 1]!;
    for (const row of state.result!.rankings) {
      expect(last.seats[row.seat]!.netWorth).toBe(row.total);
    }
  });

  it('prices a live corporation and values a defunct one at nothing', () => {
    const { turns } = retrospective(initial, log);
    for (const record of turns) {
      for (const industry of INDUSTRIES) {
        const corp = record.corps[industry];
        if (corp.live) expect(corp.size).toBeGreaterThan(0);
        else expect(corp.price).toBe(0);
      }
    }
  });

  it('records a founding, a folding and a refounding in turn order', () => {
    const { companies } = retrospective(initial, log);
    expect(companies.length).toBeGreaterThan(0);
    const turns = companies.map((event) => event.turn);
    expect([...turns].sort((a, b) => a - b)).toEqual(turns);
    // the second time a name comes onto the board it is a refounding, never a founding
    const seen = new Set<string>();
    for (const event of companies) {
      if (event.kind === 'founded') expect(seen.has(event.industry)).toBe(false);
      if (event.kind === 'refounded') expect(seen.has(event.industry)).toBe(true);
      if (event.kind !== 'folded') seen.add(event.industry);
    }
  });

  it('a folded corporation names what ate it', () => {
    const { companies } = retrospective(initial, log);
    for (const event of companies) {
      if (event.kind === 'folded') {
        expect(event.into).toBeDefined();
        expect(event.into).not.toBe(event.industry);
      }
    }
  });

  it('does not throw on a log that will not replay — it stops and says so', () => {
    const broken: Command[] = [...log.slice(0, 5), { type: 'place-tile', seat: 0, tile: '1A' }, ...log.slice(5)];
    const record = retrospective(initial, broken);
    expect(record.complete).toBe(false);
    expect(record.turns.length).toBeGreaterThan(0);
  });

  it('handles a game that never got started', () => {
    const record = retrospective(initial, []);
    expect(record.complete).toBe(true);
    expect(record.turns).toHaveLength(1);
    expect(record.companies).toHaveLength(0);
    expect(record.awards).toHaveLength(0);
  });

  it('works at a classic table, which has no motions to fold', () => {
    const game = playOut(classic, 7, 4);
    const record = retrospective(game.initial, game.log);
    expect(record.complete).toBe(true);
    expect(record.turns.length).toBeGreaterThan(1);
  });
});
