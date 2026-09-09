import { describe, expect, it } from 'vitest';
import {
  createGame,
  evaluate,
  legalMoves,
  legalMovesForSeat,
  makeRng,
  nextInt,
  reduce,
  type Command,
  type GameState,
} from '@boomtown/engine';
import { blankGame, ok, seedCorp } from './helpers.js';

describe('legalMoves matches the reducer', () => {
  const rowA = Array.from({ length: 11 }, (_, i) => `${i + 1}A`);
  const rowC = Array.from({ length: 11 }, (_, i) => `${i + 1}C`);

  it('every offered placement is accepted; dead and blocked tiles are not offered', () => {
    const game = blankGame();
    seedCorp(game, 'video', rowA);
    seedCorp(game, 'books', rowC);
    game.hands[0] = ['1B', '6E', '12I']; // 1B sits between the two safe corps -> dead
    const moves = legalMoves(game);
    const tiles = moves.filter((m) => m.type === 'place-tile').map((m) => (m.type === 'place-tile' ? m.tile : ''));
    expect(tiles).not.toContain('1B');
    expect(tiles).toContain('6E');
    for (const move of moves) expect(reduce(game, move).ok).toBe(true);
  });

  it('offers only end-turn when no hand tile is playable', () => {
    const game = blankGame();
    seedCorp(game, 'video', rowA);
    seedCorp(game, 'books', rowC);
    game.hands[0] = ['1B'];
    game.bag = [];
    expect(legalMoves(game)).toEqual([{ type: 'end-turn', seat: 0 }]);
  });

  it('at the found step, offers each unfounded corporation on each group tile', () => {
    const game = blankGame();
    game.cells['6F'] = { kind: 'unincorporated' };
    game.hands[0] = ['6E'];
    const placed = ok(game, { type: 'place-tile', seat: 0, tile: '6E' });
    const moves = legalMoves(placed);
    expect(moves.every((m) => m.type === 'found-corporation')).toBe(true);
    // 7 unfounded industries x 2 group tiles
    expect(moves).toHaveLength(14);
    for (const move of moves) expect(reduce(placed, move).ok).toBe(true);
  });

  it('at the buy step, every offered purchase is within the caps and accepted', () => {
    const game = blankGame();
    seedCorp(game, 'video', ['5H', '5I', '4I']); // $500/share
    seedCorp(game, 'books', ['1I', '2I']); // $200/share
    game.hands[0] = ['6E'];
    const atBuy = ok(game, { type: 'place-tile', seat: 0, tile: '6E' });
    const moves = legalMoves(atBuy);
    for (const move of moves) {
      expect(move.type).toBe('buy-shares');
      if (move.type !== 'buy-shares') continue;
      const total = Object.values(move.picks).reduce((s, q) => s + (q ?? 0), 0);
      expect(total).toBeLessThanOrEqual(3);
      expect(reduce(atBuy, move).ok).toBe(true);
    }
    expect(moves.some((m) => m.type === 'buy-shares' && Object.keys(m.picks).length === 0)).toBe(true);
  });

  it('during a pending merger decision, offers only that decision to its owning seat', () => {
    const game = blankGame({ seats: 3 });
    seedCorp(game, 'video', ['3E', '4E']);
    seedCorp(game, 'books', ['6E', '7E']);
    game.hands[0] = ['5E'];
    const merging = ok(game, { type: 'place-tile', seat: 0, tile: '5E' });
    const moves = legalMoves(merging);
    expect(moves.every((m) => m.type === 'choose-survivor' && m.seat === 0)).toBe(true);
    expect(legalMovesForSeat(merging, 1)).toEqual([]);
  });

  it('at end-check, offers announce-end and end-turn', () => {
    const game = blankGame();
    seedCorp(game, 'video', Array.from({ length: 11 }, (_, i) => `${i + 1}A`));
    game.step = 'end-check';
    const types = legalMoves(game).map((m) => m.type).sort();
    expect(types).toEqual(['announce-end', 'end-turn']);
  });

  it('returns nothing once the game is over', () => {
    const game = blankGame();
    game.status = 'over';
    expect(legalMoves(game)).toEqual([]);
  });
});

describe('evaluate', () => {
  it('is deterministic for a fixed state and seat', () => {
    const game = createGame({ seats: [{ name: 'A' }, { name: 'B' }], seed: 7 });
    expect(evaluate(game, 0)).toBe(evaluate(game, 0));
  });

  it('ranks a strong position above a weak one', () => {
    const game = blankGame({ seats: 2 });
    seedCorp(game, 'video', Array.from({ length: 8 }, (_, i) => `${i + 1}A`));
    game.seats[0]!.cash = 9000;
    game.seats[0]!.holdings.video = 8;
    game.seats[1]!.cash = 500;
    game.seats[1]!.holdings.video = 1;
    expect(evaluate(game, 0)).toBeGreaterThan(evaluate(game, 1));
  });

  it('reports the final total once the game is over', () => {
    const game = blankGame({ seats: 2 });
    game.result = { rankings: [{ seat: 0, cash: 6000, equity: 5000, total: 11000, holdings: [] }], winners: [0] };
    expect(evaluate(game, 0)).toBe(11000);
  });
});

describe('random legal-move playouts terminate without throwing', () => {
  function playout(seed: number): { over: boolean; moves: number } {
    let game: GameState = createGame({
      seats: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }],
      seed,
    });
    let rng = makeRng(seed ^ 0x9e3779b9);
    for (let move = 0; move < 4000; move++) {
      if (game.status === 'over') return { over: true, moves: move };
      const options = legalMoves(game);
      if (options.length === 0) return { over: false, moves: move };

      const announce = options.find((c) => c.type === 'announce-end');
      let choice: Command;
      const roll = nextInt(rng, 100);
      rng = roll.rng;
      if (announce && roll.value < 30) {
        choice = announce;
      } else {
        const pick = nextInt(rng, options.length);
        rng = pick.rng;
        choice = options[pick.value]!;
      }

      const result = reduce(game, choice);
      if (!result.ok) {
        throw new Error(`legalMoves offered an illegal ${choice.type}: ${result.error.code}`);
      }
      game = result.state;
    }
    return { over: false, moves: 4000 };
  }

  it('300 seeded games run to completion', () => {
    let finished = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const outcome = playout(seed);
      if (outcome.over) finished++;
    }
    // the vast majority reach a ranked result; the rest hit the safety cap without throwing
    expect(finished).toBeGreaterThan(270);
  });
});
