import { neighbors, type Industry, type TileId } from '@boomtown/engine';
import type { ClientView, HandTile } from '@boomtown/client-core';
import { copy, fill } from '@desktop/copy/copy.js';

const d = copy.phone.describe;

/**
 * What placing a tile would do, in words (#62).
 *
 * The phone has no board — the big screen has it — so each tile carries the
 * consequence the board would have shown: which corporation grows, which
 * merge, which loose tiles it would found a company with. Read only from the
 * seat's own view: the cells and corporations are public, and the effect is
 * what the room already computed for this hand.
 */
export function describeTile(view: ClientView, hand: HandTile): string {
  const around = neighbors(hand.tile, view.ruleset);
  const corps: Industry[] = [];
  const loose: TileId[] = [];
  for (const tile of around) {
    const cell = view.cells[tile];
    if (!cell) continue;
    if (cell.kind === 'corporation') {
      if (!corps.includes(cell.industry)) corps.push(cell.industry);
    } else {
      loose.push(tile);
    }
  }
  const name = (industry: Industry) => view.corporations[industry].displayName;

  switch (hand.effect) {
    case 'found':
      return fill(d.foundWith, { tiles: loose.join(', ') });
    case 'grow':
      return corps[0] ? fill(d.grows, { name: name(corps[0]) }) : d.nothing;
    case 'merge':
      return fill(d.merges, { names: corps.map(name).join(' and ') });
    case 'dead':
      return d.dead;
    case 'blocked':
      return d.blocked;
    case 'nothing':
      return d.nothing;
  }
}
