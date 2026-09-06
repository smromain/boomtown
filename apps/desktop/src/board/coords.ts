import { allTiles, parseTile, type Ruleset, type TileId } from '@boomtown/engine';

/** World units per board cell. */
export const CELL = 1;

/**
 * World position for a tile. The board sits flat on the XZ plane, centred on the
 * origin; Y is up. Column 1 is -X, row A is -Z.
 */
export function tileToWorld(tile: TileId, ruleset: Ruleset): [x: number, y: number, z: number] {
  const { col, row } = parseTile(tile);
  const x = (col - 1 - (ruleset.board.cols - 1) / 2) * CELL;
  const z = (row - 1 - (ruleset.board.rows - 1) / 2) * CELL;
  return [x, 0, z];
}

export function boardCells(ruleset: Ruleset): TileId[] {
  return allTiles(ruleset);
}
