import { describe, expect, it } from 'vitest';
import { allTiles, classic, formatTile, neighbors, parseTile, tileCount } from '@boomtown/engine';

describe('board topology', () => {
  it('classic board has 108 tiles, 1A..12I', () => {
    expect(tileCount(classic)).toBe(108);
    const tiles = allTiles(classic);
    expect(tiles).toHaveLength(108);
    expect(tiles[0]).toBe('1A');
    expect(tiles.at(-1)).toBe('12I');
  });

  it('round-trips tile ids through coords', () => {
    for (const tile of allTiles(classic)) {
      expect(formatTile(parseTile(tile))).toBe(tile);
    }
  });

  it('a corner tile has two neighbours', () => {
    expect(neighbors('1A', classic).sort()).toEqual(['1B', '2A']);
  });

  it('an edge tile has three neighbours', () => {
    expect(neighbors('1E', classic).sort()).toEqual(['1D', '1F', '2E']);
  });

  it('an interior tile has four neighbours', () => {
    expect(neighbors('6E', classic).sort()).toEqual(['5E', '6D', '6F', '7E']);
  });
});
