import { classic, edition2015 } from '@boomtown/engine';
import { describe, expect, it } from 'vitest';
import { boardCells, tileToWorld } from './coords.js';

describe('board coords', () => {
  it('centres the board on the origin', () => {
    // classic is 12 wide, 9 deep -> the middle sits near (0,0)
    const [x1a, y1a, z1a] = tileToWorld('1A', classic);
    const [x12i] = tileToWorld('12I', classic);
    expect(y1a).toBe(0);
    expect(x1a).toBeCloseTo(-5.5);
    expect(z1a).toBeCloseTo(-4);
    expect(x12i).toBeCloseTo(5.5);
  });

  it('adjacent tiles are one cell apart', () => {
    const [x1, , z1] = tileToWorld('6E', classic);
    const [x2, , z2] = tileToWorld('7E', classic);
    const [, , z3] = tileToWorld('6F', classic);
    expect(x2 - x1).toBeCloseTo(1);
    expect(z2).toBeCloseTo(z1);
    expect(z3 - z1).toBeCloseTo(1);
  });

  it('lists every cell for the ruleset', () => {
    expect(boardCells(classic)).toHaveLength(108);
    expect(boardCells(edition2015)).toHaveLength(108);
    expect(boardCells(classic)[0]).toBe('1A');
  });
});
