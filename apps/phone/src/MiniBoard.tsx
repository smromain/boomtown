import { useState, type ReactElement } from 'react';
import { INDUSTRY_INFO, formatTile, type TileId } from '@boomtown/engine';
import type { ClientView } from '@boomtown/client-core';
import { copy } from '@desktop/copy/copy.js';

const p = copy.phone;
const BOARD_KEY = 'boomtown.phone.board.v1';

/**
 * Whether the mini board is showing, remembered on this phone. A per-viewer
 * convenience: storage that is refused or wiped only means it starts closed.
 */
export function useBoardOpen(): [boolean, () => void] {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(BOARD_KEY) === 'open';
    } catch {
      return false;
    }
  });
  const toggle = () =>
    setOpen((was) => {
      try {
        localStorage.setItem(BOARD_KEY, was ? 'closed' : 'open');
      } catch {
        // remembered until reload only
      }
      return !was;
    });
  return [open, toggle];
}

/**
 * The board, small enough for a phone (#62): the big screen is across the room
 * and hard to read from the couch. Read-only — every cell is public, so it is
 * drawn straight from this seat's view — with this seat's own tiles ringed and
 * the one picked to place filled, so a tile's words can be checked against
 * where it lands.
 */
export function MiniBoard({ view, picked }: { view: ClientView; picked?: TileId | null }) {
  const { cols, rows } = view.ruleset.board;
  const hand = new Set(view.yourHand);
  const cells: ReactElement[] = [];
  for (let row = 1; row <= rows; row++) {
    for (let col = 1; col <= cols; col++) {
      const tile = formatTile({ col, row });
      const cell = view.cells[tile];
      const kind = cell ? (cell.kind === 'corporation' ? 'corp' : 'loose') : hand.has(tile) ? 'hand' : 'empty';
      cells.push(
        <span
          key={tile}
          className="cell"
          data-tile={tile}
          data-kind={kind}
          data-picked={picked === tile || undefined}
          style={cell?.kind === 'corporation' ? { background: INDUSTRY_INFO[cell.industry].color } : undefined}
        >
          {kind === 'empty' || kind === 'hand' ? tile : ''}
        </span>,
      );
    }
  }
  return (
    <section className="miniboard" aria-label={p.board}>
      <div className="grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} aria-hidden>
        {cells}
      </div>
    </section>
  );
}
