import { INDUSTRY_INFO, parseTile, type CorpView, type Industry, type TileId } from '@boomtown/engine';
import type { CellKind, RenderCell } from '../boardModel.js';

/**
 * What Skyline builds on each lot, as plain data (#70).
 *
 * Pure and three-free, so it is tested like `pick.ts` and the scene only draws
 * what it is handed. The rules of the city:
 *
 * - every chain is a district of low-rise blocks in its industry colour;
 * - its headquarters is a tower whose height steps with the chain's **size
 *   band** — the same bands the price table uses — so a 41-tile chain stops at
 *   eleven storeys rather than leaving the atmosphere;
 * - a safe chain's tower wears a lit crown;
 * - every company the chain has eaten is a stripe of that company's colour at
 *   the tower's foot, in the order it was eaten — the merged-name rule, drawn
 *   as architecture;
 * - an unincorporated tile is a construction pad, and a lot you can place on
 *   carries a marker that floats above every rooftop.
 */

export interface Lot {
  readonly tile: TileId;
  /** Zero-based. */
  readonly col: number;
  /** Zero-based. */
  readonly row: number;
  readonly kind: CellKind;
  /** The industry colour of a corporation lot; null for every other kind. */
  readonly color: string | null;
}

export type Building =
  | {
      readonly type: 'tower';
      readonly industry: Industry;
      readonly color: string;
      readonly ink: string;
      readonly storeys: number;
      readonly safe: boolean;
      /** Colours of the companies eaten, first eaten first. */
      readonly eaten: readonly string[];
    }
  | { readonly type: 'block'; readonly color: string; readonly height: number }
  | { readonly type: 'pad' }
  | { readonly type: 'marker' };

export interface SkylinePlan {
  readonly cols: number;
  readonly rows: number;
  readonly lots: readonly Lot[];
  readonly buildings: ReadonlyMap<TileId, Building>;
}

/** The floor-to-floor height of one storey, in lots. */
export const STOREY = 0.4;

/** Band `i` when `size <= bandCuts[i]`, else the ninth band — the price table's rule. */
export function sizeBand(size: number, bandCuts: readonly number[]): number {
  const band = bandCuts.findIndex((cut) => size <= cut);
  return band === -1 ? bandCuts.length : band;
}

/** Two storeys for a brand-new chain, one more per band. */
export function towerStoreys(size: number, bandCuts: readonly number[]): number {
  return 2 + sizeBand(size, bandCuts);
}

/**
 * A district block's height, varied per lot so a chain reads as streets rather
 * than a slab. Hashed from the tile id, not drawn from a PRNG: the same board
 * must look the same after a reload, on every screen at an online table, and in
 * every screenshot the run-app driver takes.
 */
export function blockHeight(tile: TileId): number {
  let h = 2166136261;
  for (const ch of tile) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return 0.34 + (((h >>> 0) % 1000) / 1000) * 0.34;
}

/** A building's identity for diffing: two equal keys draw the same thing. */
export function buildingKey(building: Building): string {
  switch (building.type) {
    case 'tower':
      return `tower|${building.color}|${building.storeys}|${building.safe}|${building.eaten.join(',')}`;
    case 'block':
      return `block|${building.color}`;
    default:
      return building.type;
  }
}

export function planSkyline(
  cols: number,
  rows: number,
  cells: readonly RenderCell[],
  corporations: Readonly<Record<Industry, CorpView>>,
  bandCuts: readonly number[],
): SkylinePlan {
  const lots: Lot[] = [];
  const buildings = new Map<TileId, Building>();
  for (const cell of cells) {
    const { col, row } = parseTile(cell.tile);
    const industry = cell.kind === 'corp' ? cell.industry : null;
    const color = industry ? INDUSTRY_INFO[industry].color : null;
    lots.push({ tile: cell.tile, col: col - 1, row: row - 1, kind: cell.kind, color });

    if (industry && color) {
      const corp = corporations[industry];
      if (cell.isHq) {
        buildings.set(cell.tile, {
          type: 'tower',
          industry,
          color,
          ink: INDUSTRY_INFO[industry].ink,
          storeys: towerStoreys(corp.size, bandCuts),
          safe: corp.safe,
          eaten: corp.eaten.map((absorbed) => INDUSTRY_INFO[absorbed.industry].color),
        });
      } else {
        buildings.set(cell.tile, { type: 'block', color, height: blockHeight(cell.tile) });
      }
    } else if (cell.kind === 'uninc') {
      buildings.set(cell.tile, { type: 'pad' });
    } else if (cell.kind === 'playable') {
      buildings.set(cell.tile, { type: 'marker' });
    }
  }
  return { cols, rows, lots, buildings };
}
