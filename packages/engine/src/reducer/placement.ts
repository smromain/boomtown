import { neighbors, type TileId } from '../board.js';
import { INDUSTRIES, type Industry } from '../pool.js';
import { activeCorporations, corpSize, isSafe, type GameState } from '../state.js';

export type Placement =
  | { readonly kind: 'nothing' }
  | { readonly kind: 'found'; readonly group: readonly TileId[] }
  /** Would found an eighth corporation. The tile stays in hand and is not dead. */
  | { readonly kind: 'found-blocked' }
  | { readonly kind: 'grow'; readonly industry: Industry; readonly absorbs: readonly TileId[] }
  | {
      readonly kind: 'merge';
      readonly corporations: readonly Industry[];
      /** The placed tile plus connected unincorporated tiles — all join the survivor afterwards. */
      readonly group: readonly TileId[];
    }
  /** Permanently unplayable: would dissolve or merge a safe corporation. */
  | { readonly kind: 'dead'; readonly reason: string };

/** Unincorporated tiles reachable from `start` through unincorporated cells, including `start`. */
function connectedUnincorporated(state: GameState, start: TileId): TileId[] {
  const seen = new Set<TileId>([start]);
  const queue: TileId[] = [start];
  while (queue.length > 0) {
    const tile = queue.shift()!;
    for (const next of neighbors(tile, state.ruleset)) {
      if (seen.has(next)) continue;
      if (state.cells[next]?.kind === 'unincorporated') {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return [...seen];
}

/** Classify what placing `tile` would do, without mutating state. */
export function classifyPlacement(state: GameState, tile: TileId): Placement {
  const adjacentCorps = new Set<Industry>();
  let touchesUnincorporated = false;

  for (const next of neighbors(tile, state.ruleset)) {
    const cell = state.cells[next];
    if (!cell) continue;
    if (cell.kind === 'corporation') adjacentCorps.add(cell.industry);
    else touchesUnincorporated = true;
  }

  const corps = INDUSTRIES.filter((i) => adjacentCorps.has(i));

  if (corps.length >= 2) {
    const safeCount = corps.filter((i) => isSafe(state, i)).length;
    if (safeCount >= 2) {
      return { kind: 'dead', reason: 'two safe corporations can never merge' };
    }
    if (safeCount === 1) {
      const largest = Math.max(...corps.map((i) => corpSize(state, i)));
      const safeCorp = corps.find((i) => isSafe(state, i))!;
      if (corpSize(state, safeCorp) < largest) {
        return { kind: 'dead', reason: 'a safe corporation cannot be dissolved' };
      }
    }
    return { kind: 'merge', corporations: corps, group: connectedUnincorporated(state, tile) };
  }

  if (corps.length === 1) {
    return {
      kind: 'grow',
      industry: corps[0]!,
      absorbs: connectedUnincorporated(state, tile),
    };
  }

  if (touchesUnincorporated) {
    if (activeCorporations(state).length >= INDUSTRIES.length) {
      return { kind: 'found-blocked' };
    }
    return { kind: 'found', group: connectedUnincorporated(state, tile) };
  }

  return { kind: 'nothing' };
}

/** Whether a hand tile can be legally placed this turn (not dead, not blocked). */
export function isPlayable(state: GameState, tile: TileId): boolean {
  if (state.cells[tile]) return false;
  const outcome = classifyPlacement(state, tile);
  return outcome.kind !== 'dead' && outcome.kind !== 'found-blocked';
}

/** Whether a tile is permanently dead (would merge/dissolve safe corporations). */
export function isDead(state: GameState, tile: TileId): boolean {
  if (state.cells[tile]) return false;
  return classifyPlacement(state, tile).kind === 'dead';
}
