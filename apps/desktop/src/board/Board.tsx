import { useMemo } from 'react';
import { allTiles, INDUSTRY_INFO, parseTile, type Cell, type CorpView, type Industry, type TileId } from '@boomtown/engine';
import type { ClientView } from '@boomtown/client-core';
import { useGameClient, useGameState, useLocalActiveView } from '../client/GameClientProvider.js';
import { IndustryMark } from '../game/marks.js';
import { cellTargets, placementFor } from './pick.js';
import styles from './board.module.css';

const ROW_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

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
 */
export function Board() {
  const client = useGameClient();
  const view = useLocalActiveView();
  const busy = useGameState((state) => state.inFlight != null);

  const targets = useMemo(() => cellTargets(view), [view]);

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
    const command = placementFor(view, busy, tile);
    if (command) client.dispatch(command);
  };

  return (
    <div className={styles.stage}>
      <div
        className={styles.board}
        role="grid"
        aria-label="Board"
        style={{
          gridTemplateColumns: `var(--hdr) repeat(${cols}, 1fr)`,
          gridTemplateRows: `var(--hdr) repeat(${rows}, 1fr)`,
          aspectRatio: `${cols + HDR_FRACTION} / ${rows + HDR_FRACTION}`,
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
                <BoardCell key={c.tile} cell={c} disabled={busy || c.kind !== 'playable'} onPick={pick} view={view} />
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
}: {
  cell: RenderCell;
  disabled: boolean;
  onPick: (tile: TileId) => void;
  view: ClientView;
}) {
  const industry = cell.industry;
  // The tilted board's lit-paper cell treatment (U8): a per-industry gradient
  // (not a flat fill) with a stacked "tile edge" shadow and a translateZ lift
  // that reads as thickness under the perspective tilt — the HQ tile sits
  // slightly proud of its neighbours.
  const style =
    cell.kind === 'corp' && industry
      ? (() => {
          const { color, ink } = INDUSTRY_INFO[industry];
          const lift = cell.isHq ? 2.3 : 2;
          const shade1 = `color-mix(in srgb, ${color} 74%, #1c1917)`;
          const shade2 = `color-mix(in srgb, ${color} 56%, #1c1917)`;
          return {
            background: `linear-gradient(170deg, color-mix(in srgb, ${color} 88%, #fff) 0%, ${color} 62%, ${shade1} 100%)`,
            color: ink,
            boxShadow: `0 ${lift}px 0 ${shade1}, 0 ${lift * 2}px 0 ${shade2}, 0 ${lift * 2 + 4}px 10px -4px rgba(60, 45, 30, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.3)`,
            transform: `translateZ(${lift * 3}px)`,
          };
        })()
      : undefined;

  const content =
    cell.isHq && industry ? (
      <span className={styles.hq}>
        <span className={styles.hqBadge} style={{ background: INDUSTRY_INFO[industry].ink }}>
          <IndustryMark industry={industry} color={INDUSTRY_INFO[industry].color} size={16} />
        </span>
        <span className={styles.hqCoord}>{cell.tile}</span>
      </span>
    ) : (
      cell.tile
    );

  const label =
    cell.kind === 'playable'
      ? `Place at ${cell.tile}`
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
