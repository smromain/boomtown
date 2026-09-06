import type { Ruleset } from './ruleset/types.js';

/** A tile / cell id: column number then row letter, e.g. `1A`, `12I`. */
export type TileId = string;

const ROW_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export interface Coord {
  /** 1-based column. */
  readonly col: number;
  /** 1-based row. */
  readonly row: number;
}

export function formatTile({ col, row }: Coord): TileId {
  return `${col}${ROW_LETTERS[row - 1]}`;
}

export function parseTile(tile: TileId): Coord {
  const match = /^(\d+)([A-Z])$/.exec(tile);
  if (!match) throw new Error(`not a tile id: ${tile}`);
  return { col: Number(match[1]), row: ROW_LETTERS.indexOf(match[2]!) + 1 };
}

/** Whether a coord is inside the board defined by the ruleset. */
export function onBoard(coord: Coord, ruleset: Ruleset): boolean {
  return (
    coord.col >= 1 &&
    coord.col <= ruleset.board.cols &&
    coord.row >= 1 &&
    coord.row <= ruleset.board.rows
  );
}

/** Every tile id, in canonical order: column-major, `1A`,`1B`,…,`2A`,… */
export function allTiles(ruleset: Ruleset): TileId[] {
  const tiles: TileId[] = [];
  for (let col = 1; col <= ruleset.board.cols; col++) {
    for (let row = 1; row <= ruleset.board.rows; row++) {
      tiles.push(formatTile({ col, row }));
    }
  }
  return tiles;
}

export function tileCount(ruleset: Ruleset): number {
  return ruleset.board.cols * ruleset.board.rows;
}

const OFFSETS: readonly Coord[] = [
  { col: 0, row: -1 },
  { col: 0, row: 1 },
  { col: -1, row: 0 },
  { col: 1, row: 0 },
];

/** Orthogonally adjacent tiles that are on the board. */
export function neighbors(tile: TileId, ruleset: Ruleset): TileId[] {
  const { col, row } = parseTile(tile);
  const out: TileId[] = [];
  for (const off of OFFSETS) {
    const next = { col: col + off.col, row: row + off.row };
    if (onBoard(next, ruleset)) out.push(formatTile(next));
  }
  return out;
}
