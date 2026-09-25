import { useMemo } from 'react';
import { allTiles, parseTile, type Cell, type CorpView, type Industry, type TileId } from '@boomtown/engine';
import type { ClientView } from '@boomtown/client-core';
import { useAnyView, useGameClient, useGameState, useLocalActiveView } from '../client/GameClientProvider.js';
import { IndustryMark } from '../game/marks.js';
import { industryTheme, patternedBackground } from '../game/industryTheme.js';
import { useIndustryPatterns } from '../settings/useSetting.js';
import { latestMerger } from '../game/story.js';
import { cellTargets, placementFor, type CellTarget } from './pick.js';
import styles from './board.module.css';
import { copy, fill } from '../copy/copy.js';

const ROW_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

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
function sweepDelay(tile: TileId, from: TileId | null): number {
  if (!from) return 0;
  const a = parseTile(tile);
  const b = parseTile(from);
  const distance = Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
  return Math.min(distance * SWEEP_STEP_MS, SWEEP_MAX_MS);
}

/** The coordinate-header track as a fraction of one cell. Keep `--hdr` in
 *  board.module.css in sync (1.5fr). */
const HDR_FRACTION = 1.5;

type CellKind = 'empty' | 'uninc' | 'corp' | 'playable' | 'dead' | 'merge-target';

interface RenderCell {
  readonly tile: TileId;
  readonly kind: CellKind;
  readonly industry: Industry | null;
  readonly isHq: boolean;
}

function classify(
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

/**
 * The board — the design's flat CSS grid (12 columns + a row-header, 9 rows + a
 * column-header). It fills its container: the grid is square-celled via
 * `aspect-ratio`, so it scales with the space the layout gives it. A click on a
 * playable cell dispatches its placement (the only board interaction).
 *
 * `spectating` renders the same board read-only, for a turn that isn't yours
 * (a bot's, or a remote player's): the cells come from `useAnyView()` — public
 * state, safe on any turn — and **no hand is read at all**. That is the point,
 * not an optimisation: `anyView` returns whichever view comes first in
 * `state.views`, which in hot-seat is seat 0's, so marking targets from it
 * would paint one player's hand onto everyone else's screen. With no targets
 * no cell classifies as `playable`/`dead`, so no cell renders as a button
 * either — the read-only board has no interactive surface to gate.
 */
export function Board({ spectating = false }: { spectating?: boolean }) {
  const client = useGameClient();
  const localView = useLocalActiveView();
  const publicView = useAnyView();
  const view = spectating ? publicView : localView;
  const busy = useGameState((state) => state.inFlight != null);
  // The tile whose placement caused the most recent merger — the origin of the
  // recolour sweep. Null before any merger, which simply means no stagger.
  const mergedAt = useGameState((state) => latestMerger(state.log)?.placedTile ?? null);
  const patterns = useIndustryPatterns();

  const targets = useMemo(() => (spectating ? NO_TARGETS : cellTargets(view)), [spectating, view]);

  const { cols, rows, cells } = useMemo(() => {
    if (!view) return { cols: 12, rows: 9, cells: [] as RenderCell[] };
    const { cols, rows } = view.ruleset.board;
    const hqByTile = new Map<TileId, Industry>();
    for (const [industry, corp] of Object.entries(view.corporations) as [Industry, CorpView][]) {
      if (corp.founded && corp.hqTile) hqByTile.set(corp.hqTile, industry);
    }
    const rendered = allTiles(view.ruleset).map((tile) =>
      classify(tile, view.cells[tile], targets.get(tile), hqByTile.get(tile) ?? null),
    );
    return { cols, rows, cells: rendered };
  }, [view, targets]);

  if (!view) return null;

  const pick = (tile: TileId): void => {
    // Unreachable while spectating (no cell renders as a button), but the
    // command would carry *our* seat, not the seat on the clock — refuse it at
    // the source rather than rely on the engine rejecting a wrong-seat command.
    if (spectating) return;
    const command = placementFor(view, busy, tile);
    if (command) client.dispatch(command);
  };

  return (
    <div className={styles.stage}>
      <div
        className={styles.board}
        role="grid"
        aria-label={copy.board.label}
        aria-readonly={spectating || undefined}
        style={{
          // `minmax(0, …)`, never a bare `1fr`: a bare `1fr` is
          // `minmax(auto, 1fr)`, so every column carried a min-content floor
          // from its own coordinate label. Below the width where those floors
          // stopped fitting the grid refused to shrink any further and spilled
          // straight out of `.board`'s `max-width`, sliding under the right
          // rail instead of scaling down (#71).
          gridTemplateColumns: `var(--hdr) repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `var(--hdr) repeat(${rows}, minmax(0, 1fr))`,
          aspectRatio: `${cols + HDR_FRACTION} / ${rows + HDR_FRACTION}`,
          // The same ratio as a bare number, for the sizing formula in
          // `board.module.css`. `aspect-ratio` alone cannot size the plate:
          // with a definite `height` it is the width that gives way, and a
          // `max-width` then clamps the box without shrinking the height back
          // — which left a plate far taller than its own grid (#71).
          ['--ratio' as string]: String((cols + HDR_FRACTION) / (rows + HDR_FRACTION)),
        }}
      >
        <div className={styles.corner} aria-hidden />
        {Array.from({ length: cols }, (_, i) => (
          <div key={`c${i}`} className={styles.header} aria-hidden>
            {i + 1}
          </div>
        ))}

        {Array.from({ length: rows }, (_, r) => (
          <RowFragment key={`r${r}`}>
            <div className={styles.header} aria-hidden>
              {ROW_LETTERS[r]}
            </div>
            {cells
              .filter((c) => parseTile(c.tile).row === r + 1)
              .map((c) => (
                <BoardCell
                  key={c.tile}
                  cell={c}
                  disabled={busy || c.kind !== 'playable'}
                  onPick={pick}
                  view={view}
                  sweepMs={sweepDelay(c.tile, mergedAt as TileId | null)}
                  patterns={patterns}
                />
              ))}
          </RowFragment>
        ))}
      </div>
    </div>
  );
}

/** Grid children must be direct — a fragment keeps the row readable in JSX. */
function RowFragment({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function BoardCell({
  cell,
  disabled,
  onPick,
  view,
  sweepMs,
  patterns,
}: {
  cell: RenderCell;
  disabled: boolean;
  onPick: (tile: TileId) => void;
  view: ClientView;
  sweepMs: number;
  patterns: boolean;
}) {
  const industry = cell.industry;
  // The tilted board's lit-paper cell treatment (U8): a per-industry gradient
  // (not a flat fill) with a stacked "tile edge" shadow and a translateZ lift
  // that reads as thickness under the perspective tilt — the HQ tile sits
  // slightly proud of its neighbours.
  const style =
    cell.kind === 'corp' && industry
      ? (() => {
          const { color, ink } = industryTheme(industry);
          const lift = cell.isHq ? 2.3 : 2;
          const shade1 = `color-mix(in srgb, ${color} 74%, #1c1917)`;
          const shade2 = `color-mix(in srgb, ${color} 56%, #1c1917)`;
          const base = `linear-gradient(170deg, color-mix(in srgb, ${color} 88%, #fff) 0%, ${color} 62%, ${shade1} 100%)`;
          return {
            // The texture (#19) is a layer in the same `background`, so a
            // merger's sweep swaps pattern and colour in the same frame.
            ...patternedBackground(industry, base, patterns),
            color: ink,
            boxShadow: `0 ${lift}px 0 ${shade1}, 0 ${lift * 2}px 0 ${shade2}, 0 ${lift * 2 + 4}px 10px -4px rgba(60, 45, 30, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.3)`,
            transform: `translateZ(${lift * 3}px)`,
            transitionDelay: sweepMs ? `${sweepMs}ms` : undefined,
          };
        })()
      : undefined;

  // Every corporation cell carries its industry glyph, not just the
  // headquarters (#18). Colour alone made a merger a single-channel change —
  // one hue swapping for another, on every tile but one. With the mark there
  // too the takeover changes shape as well, which survives both a close pair of
  // colours and a player who cannot tell them apart at all.
  const content =
    cell.isHq && industry ? (
      <span className={styles.hq}>
        <span className={styles.hqBadge} style={{ background: industryTheme(industry).ink }}>
          <IndustryMark industry={industry} color={industryTheme(industry).color} size={16} />
        </span>
        <span className={styles.hqCoord}>{cell.tile}</span>
      </span>
    ) : cell.kind === 'corp' && industry ? (
      <span className={styles.corpCell}>
        <IndustryMark industry={industry} color={industryTheme(industry).ink} size={13} />
        <span className={styles.corpCoord}>{cell.tile}</span>
      </span>
    ) : (
      cell.tile
    );

  const label =
    cell.kind === 'playable'
      ? fill(copy.board.placeAt, { tile: cell.tile })
      : cell.kind === 'corp' && industry
        ? `${cell.tile} — ${view.corporations[industry].displayName}`
        : cell.tile;

  if (cell.kind === 'playable') {
    return (
      <button
        type="button"
        role="gridcell"
        className={styles.cell}
        data-kind="playable"
        disabled={disabled}
        aria-label={label}
        onClick={() => onPick(cell.tile)}
      >
        {content}
      </button>
    );
  }

  return (
    <div role="gridcell" className={styles.cell} data-kind={cell.kind} style={style} aria-label={label}>
      {cell.kind === 'dead' ? <s>{cell.tile}</s> : content}
    </div>
  );
}
