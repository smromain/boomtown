import { describe, expect, it } from 'vitest';
import { PRESETS, type CorpView, type Industry, type TileId } from '@boomtown/engine';
import type { RenderCell } from '../boardModel.js';
import { blockHeight, buildingKey, planSkyline, sizeBand, towerStoreys } from './skylineModel.js';

const CLASSIC = PRESETS.classic.bandCuts;

describe('tower height follows chain size', () => {
  it("steps with the price table's size bands, nine heights in all", () => {
    expect([2, 3, 4, 5, 6, 10, 11, 20, 21, 30, 31, 40, 41, 108].map((n) => sizeBand(n, CLASSIC))).toEqual([
      0, 1, 2, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8,
    ]);
    expect(towerStoreys(2, CLASSIC)).toBe(2);
    expect(towerStoreys(41, CLASSIC)).toBe(10);
    expect(towerStoreys(108, CLASSIC)).toBe(10);
  });

  it('reads the cuts from the ruleset, so the 2015 edition gets its own', () => {
    const cuts = PRESETS['edition-2015'].bandCuts;
    expect(sizeBand(cuts[4]!, cuts)).toBe(4);
    expect(sizeBand(cuts[4]! + 1, cuts)).toBe(5);
  });
});

describe('planSkyline', () => {
  const cell = (tile: string, kind: RenderCell['kind'], industry: Industry | null = null, isHq = false): RenderCell => ({
    tile: tile as TileId,
    kind,
    industry,
    isHq,
  });
  const corp = (over: Partial<CorpView>): CorpView =>
    ({ founded: true, safe: false, size: 3, hqTile: null, tiles: [], sharePrice: 300, bankShares: 25, baseName: '', displayName: '', flavour: '', eaten: [], ...over }) as CorpView;
  const corporations = {
    video: corp({ size: 12, safe: true, eaten: [{ industry: 'toys', displayName: 'x' }, { industry: 'air', displayName: 'y' }] }),
  } as unknown as Record<Industry, CorpView>;

  const plan = planSkyline(
    12,
    9,
    [
      cell('1A', 'empty'),
      cell('2A', 'playable'),
      cell('3A', 'dead'),
      cell('4A', 'uninc'),
      cell('6E', 'corp', 'video', true),
      cell('7E', 'corp', 'video'),
    ],
    corporations,
    CLASSIC,
  );

  it('builds a crowned tower on a safe headquarters, striped with what it ate in order', () => {
    const tower = plan.buildings.get('6E' as TileId);
    expect(tower).toMatchObject({ type: 'tower', storeys: 7, safe: true });
    expect(tower?.type === 'tower' && tower.eaten).toEqual(['#66CAD8', '#355C99']);
  });

  it('puts a block on the rest of the chain, a pad on an unincorporated tile and a marker where you may play', () => {
    expect(plan.buildings.get('7E' as TileId)).toMatchObject({ type: 'block' });
    expect(plan.buildings.get('4A' as TileId)).toEqual({ type: 'pad' });
    expect(plan.buildings.get('2A' as TileId)).toEqual({ type: 'marker' });
    expect(plan.buildings.has('1A' as TileId)).toBe(false);
    expect(plan.buildings.has('3A' as TileId)).toBe(false);
  });

  it('lays every lot out zero-based, with its colour only when a chain owns it', () => {
    expect(plan.lots.find((l) => l.tile === '7E')).toMatchObject({ col: 6, row: 4, kind: 'corp' });
    expect(plan.lots.find((l) => l.tile === '3A')).toMatchObject({ col: 2, row: 0, kind: 'dead', color: null });
  });

  it('varies block heights per lot, the same every time', () => {
    const heights = ['1A', '2A', '3A', '4A', '5A'].map((t) => blockHeight(t as TileId));
    expect(new Set(heights).size).toBeGreaterThan(1);
    expect(heights.every((h) => h >= 0.34 && h <= 0.68)).toBe(true);
    expect(blockHeight('7E' as TileId)).toBe(blockHeight('7E' as TileId));
  });

  it('keys a tower on everything that changes how it looks', () => {
    const tower = plan.buildings.get('6E' as TileId)!;
    const grown = { ...tower, storeys: 8 } as typeof tower;
    expect(buildingKey(grown)).not.toBe(buildingKey(tower));
  });
});
