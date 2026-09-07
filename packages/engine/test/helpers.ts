import {
  createGame,
  reduce,
  type Cell,
  type Command,
  type GameState,
  type Industry,
  type Ruleset,
  type TileId,
} from '@boomtown/engine';
import { expect } from 'vitest';

/** A 2-seat game with an empty board and hands you set explicitly. */
export function blankGame(overrides?: { ruleset?: Ruleset; seats?: number }): GameState {
  const seatCount = overrides?.seats ?? 2;
  const game = createGame({
    seats: Array.from({ length: seatCount }, (_, i) => ({ name: `P${i}` })),
    seed: 1,
    ...(overrides?.ruleset ? { ruleset: overrides.ruleset } : {}),
    turnOrder: Array.from({ length: seatCount }, (_, i) => i),
    // fixed line-up: the first candidate for every industry (see POOL[industry][0])
    companyDraw: { books: 0, electronics: 0, air: 0, energy: 0, tech: 0, video: 0, toys: 0 },
  });
  game.hands = game.hands.map(() => []);
  return game;
}

/** Put tiles on the board as an existing corporation, marking it founded and safe-eligible. */
export function seedCorp(game: GameState, industry: Industry, tiles: TileId[], hqTile?: TileId): void {
  const corp = game.corporations[industry];
  corp.founded = true;
  corp.tiles = [...tiles];
  corp.hqTile = hqTile ?? tiles[0] ?? null;
  for (const tile of tiles) {
    game.cells[tile] = { kind: 'corporation', industry } satisfies Cell;
  }
}

export function seedUnincorporated(game: GameState, ...tiles: TileId[]): void {
  for (const tile of tiles) game.cells[tile] = { kind: 'unincorporated' };
}

/** Apply a command and assert it succeeded, returning the next state. */
export function ok(game: GameState, command: Command): GameState {
  const result = reduce(game, command);
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}: ${result.error.message}`);
  return result.state;
}

/** Apply a command and assert it was rejected with `code`. */
export function rejects(game: GameState, command: Command, code: string): void {
  const result = reduce(game, command);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe(code);
}
