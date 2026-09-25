import type { CSSProperties, Ref } from 'react';
import { INDUSTRY_INFO, parseTile, type TileId } from '@boomtown/engine';
import type { ClientView } from '@boomtown/client-core';
import { IndustryMark } from '../game/marks.js';
import { sweepDelay, type BoardModel, type RenderCell } from './boardModel.js';
import styles from './board.module.css';
import { copy, fill } from '../copy/copy.js';

const ROW_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** The coordinate-header track as a fraction of one cell. Keep `--hdr` in
 *  board.module.css in sync (1.5fr). */
const HDR_FRACTION = 1.5;

/** What a cell is called. The same in both painters: it is the contract. */
function cellLabel(cell: RenderCell, view: ClientView): string {
  if (cell.kind === 'playable') return fill(copy.board.placeAt, { tile: cell.tile });
  if (cell.kind === 'corp' && cell.industry) return `${cell.tile} — ${view.corporations[cell.industry].displayName}`;
  return cell.tile;
}

/**
 * The board's DOM: `role="grid"`, one `role="gridcell"` per tile with its
 * accessible name, and a `<button>` on every cell a click can place a tile on.
 * Tests, the run-app driver and screen readers all stand on this, so both
 * painters render it — Board View paints the cells themselves, and Skyline lays
 * the same grid, transparent, over its canvas (#70).
 */
export function BoardGrid({ model }: { model: BoardModel }) {
  const { cols, rows, cells, view, busy, spectating, mergedAt, pick } = model;
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
                  sweepMs={sweepDelay(c.tile, mergedAt)}
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
}: {
  cell: RenderCell;
  disabled: boolean;
  onPick: (tile: TileId) => void;
  view: ClientView;
  sweepMs: number;
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
        <span className={styles.hqBadge} style={{ background: INDUSTRY_INFO[industry].ink }}>
          <IndustryMark industry={industry} color={INDUSTRY_INFO[industry].color} size={16} />
        </span>
        <span className={styles.hqCoord}>{cell.tile}</span>
      </span>
    ) : cell.kind === 'corp' && industry ? (
      <span className={styles.corpCell}>
        <IndustryMark industry={industry} color={INDUSTRY_INFO[industry].ink} size={13} />
        <span className={styles.corpCoord}>{cell.tile}</span>
      </span>
    ) : (
      cell.tile
    );

  const label = cellLabel(cell, view);

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

/** What the Skyline painter needs to hear from the grid laid over it. */
export interface OverlayEvents {
  readonly onHover: (tile: TileId | null) => void;
  readonly onFocus: (tile: TileId | null) => void;
}

/** Reading order — A1, A2 … — for the DOM, which is also tab order. `allTiles`
 *  runs down the columns, which is right for the engine and wrong for a reader. */
function byRow(cells: readonly RenderCell[]): RenderCell[] {
  const key = (c: RenderCell) => {
    const { col, row } = parseTile(c.tile);
    return row * 1000 + col;
  };
  return [...cells].sort((a, b) => key(a) - key(b));
}

/**
 * The same grid, for Skyline: no headers (the coordinates are painted on the
 * ground) and no paint of its own. Every cell is a fixed square so the painter
 * can pin the whole grid onto its ground plane with one affine transform, which
 * it writes straight to `gridRef` on every frame it renders.
 */
export function OverlayGrid({
  model,
  gridRef,
  cellPx,
  events,
  style,
}: {
  model: BoardModel;
  gridRef: Ref<HTMLDivElement>;
  cellPx: number;
  events: OverlayEvents;
  style?: CSSProperties;
}) {
  const { cols, rows, cells, view, busy, spectating, pick } = model;
  return (
    <div
      ref={gridRef}
      className={styles.overlayGrid}
      role="grid"
      aria-label={copy.board.label}
      aria-readonly={spectating || undefined}
      onPointerLeave={() => events.onHover(null)}
      style={{
        width: cols * cellPx,
        height: rows * cellPx,
        gridTemplateColumns: `repeat(${cols}, ${cellPx}px)`,
        gridTemplateRows: `repeat(${rows}, ${cellPx}px)`,
        ...style,
      }}
    >
      {byRow(cells).map((cell) => {
        const label = cellLabel(cell, view);
        const { col, row } = parseTile(cell.tile);
        const common = {
          role: 'gridcell',
          style: { gridColumn: col, gridRow: row },
          className: styles.overlayCell,
          'data-kind': cell.kind,
          'aria-label': label,
          onPointerEnter: () => events.onHover(cell.tile),
          onFocus: () => events.onFocus(cell.tile),
          onBlur: () => events.onFocus(null),
        } as const;
        return cell.kind === 'playable' ? (
          <button key={cell.tile} type="button" {...common} disabled={busy} onClick={() => pick(cell.tile)} />
        ) : (
          <div key={cell.tile} {...common} />
        );
      })}
    </div>
  );
}
