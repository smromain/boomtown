import { useMemo } from 'react';
import { allTiles, parseTile, type Cell, type CorpView, type Industry, type TileId } from '@boomtown/engine';
import type { ClientView } from '@boomtown/client-core';
import { useAnyView, useGameClient, useGameState, useLocalActiveView } from '../client/GameClientProvider.js';
import { latestMerger } from '../game/story.js';
import { cellTargets, placementFor, type CellTarget } from './pick.js';

/**
 * What each cell of the board *is*, apart from how it is drawn.
 *
 * Board View and Skyline paint the same model (#70). Everything a player can
 * act on or a test can query — which cells are playable, what each one is
 * called, what a click on it dispatches — is decided here once, so the two
 * painters cannot disagree about the board. They differ only in pixels.
 */

/** Stable empty target set for the spectator board — a fresh `new Map()` per
 *  render would defeat the `useMemo` below. */
const NO_TARGETS: ReadonlyMap<TileId, CellTarget> = new Map();

/** Longest stagger applied to the recolour sweep, in ms. */
const SWEEP_MAX_MS = 320;
/** Per-cell step outward from the placed tile. */
const SWEEP_STEP_MS = 26;

/**
 * How long this cell waits before taking its new colour, so a merger reads as a
 * wave running out from the tile that caused it rather than as every cell
 * flipping at once. Chebyshev distance, because the board is a grid and a
 * diagonal neighbour is as adjacent as an orthogonal one to the eye.
 */
export function sweepDelay(tile: TileId, from: TileId | null, stepMs = SWEEP_STEP_MS, maxMs = SWEEP_MAX_MS): number {
  if (!from) return 0;
  const a = parseTile(tile);
  const b = parseTile(from);
  const distance = Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
  return Math.min(distance * stepMs, maxMs);
}

export type CellKind = 'empty' | 'uninc' | 'corp' | 'playable' | 'dead' | 'merge-target';

export interface RenderCell {
  readonly tile: TileId;
  readonly kind: CellKind;
  readonly industry: Industry | null;
  readonly isHq: boolean;
}

export function classify(
  tile: TileId,
  cell: Cell | undefined,
  target: 'playable' | 'dead' | undefined,
  hqOf: Industry | null,
): RenderCell {
  if (cell?.kind === 'corporation') {
    return { tile, kind: 'corp', industry: cell.industry, isHq: hqOf === cell.industry };
  }
  if (cell?.kind === 'unincorporated') return { tile, kind: 'uninc', industry: null, isHq: false };
  if (target === 'playable') return { tile, kind: 'playable', industry: null, isHq: false };
  if (target === 'dead') return { tile, kind: 'dead', industry: null, isHq: false };
  return { tile, kind: 'empty', industry: null, isHq: false };
}

export interface BoardModel {
  readonly view: ClientView;
  readonly cols: number;
  readonly rows: number;
  readonly cells: readonly RenderCell[];
  /** A command is in flight, so no cell accepts a click. */
  readonly busy: boolean;
  readonly spectating: boolean;
  /** The tile whose placement caused the most recent merger — the origin of the recolour sweep. */
  readonly mergedAt: TileId | null;
  /** The most recently placed tile, anywhere on the board. Skyline's changes radiate from it. */
  readonly lastPlaced: TileId | null;
  /** Dispatch a placement on `tile`, or do nothing when the click is not a legal move. */
  readonly pick: (tile: TileId) => void;
}

/**
 * The board model for this screen, or null when there is no view to draw.
 *
 * `spectating` builds the same board read-only, for a turn that isn't yours
 * (a bot's, or a remote player's): the cells come from `useAnyView()` — public
 * state, safe on any turn — and **no hand is read at all**. That is the point,
 * not an optimisation: `anyView` returns whichever view comes first in
 * `state.views`, which in hot-seat is seat 0's, so marking targets from it
 * would paint one player's hand onto everyone else's screen. With no targets
 * no cell classifies as `playable`/`dead`, so no cell renders as a button
 * either — the read-only board has no interactive surface to gate.
 */
export function useBoardModel(spectating: boolean): BoardModel | null {
  const client = useGameClient();
  const localView = useLocalActiveView();
  const publicView = useAnyView();
  const view = spectating ? publicView : localView;
  const busy = useGameState((state) => state.inFlight != null);
  // Null before any merger, which simply means no stagger.
  const mergedAt = useGameState((state) => latestMerger(state.log)?.placedTile ?? null) as TileId | null;
  const lastPlaced = useGameState((state) => {
    for (let i = state.log.length - 1; i >= 0; i--) {
      const event = state.log[i]!;
      if (event.type === 'tile-placed') return event.tile;
    }
    return null;
  });

  const targets = useMemo(() => (spectating ? NO_TARGETS : cellTargets(view)), [spectating, view]);

  const cells = useMemo(() => {
    if (!view) return [] as RenderCell[];
    const hqByTile = new Map<TileId, Industry>();
    for (const [industry, corp] of Object.entries(view.corporations) as [Industry, CorpView][]) {
      if (corp.founded && corp.hqTile) hqByTile.set(corp.hqTile, industry);
    }
    return allTiles(view.ruleset).map((tile) =>
      classify(tile, view.cells[tile], targets.get(tile), hqByTile.get(tile) ?? null),
    );
  }, [view, targets]);

  return useMemo(() => {
    if (!view) return null;
    const pick = (tile: TileId): void => {
      // Unreachable while spectating (no cell renders as a button), but the
      // command would carry *our* seat, not the seat on the clock — refuse it at
      // the source rather than rely on the engine rejecting a wrong-seat command.
      if (spectating) return;
      const command = placementFor(view, busy, tile);
      if (command) client.dispatch(command);
    };
    const { cols, rows } = view.ruleset.board;
    return { view, cols, rows, cells, busy, spectating, mergedAt, lastPlaced, pick };
  }, [view, cells, busy, spectating, mergedAt, lastPlaced, client]);
}
