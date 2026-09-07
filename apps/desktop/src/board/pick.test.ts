import { createGame } from '@boomtown/engine';
import { clientView, type ClientView } from '@boomtown/client-core';
import { describe, expect, it } from 'vitest';
import { cellTargets, placementFor } from './pick.js';

const view = clientView(
  createGame({ seats: [{ name: 'A' }, { name: 'B' }], seed: 1, turnOrder: [0, 1] }),
  0,
);
const firstTile = view.yourHand[0]!;

describe('cellTargets', () => {
  it('marks every playable hand tile on an empty board', () => {
    const targets = cellTargets(view);
    expect(targets.size).toBe(6);
    for (const kind of targets.values()) expect(kind).toBe('playable');
  });

  it('is empty off the placement step', () => {
    expect(cellTargets({ ...view, step: 'buy' }).size).toBe(0);
  });
});

describe('placementFor', () => {
  it('returns a place-tile command for a playable cell on the placement step', () => {
    expect(placementFor(view, false, firstTile)).toEqual({ type: 'place-tile', seat: 0, tile: firstTile });
  });

  it('returns null for a cell that is not one of the seat’s playable tiles', () => {
    expect(placementFor(view, false, '12I')).toBeNull();
  });

  it('returns null while a command is in flight', () => {
    expect(placementFor(view, true, firstTile)).toBeNull();
  });

  it('returns null when it is not the placement step', () => {
    const buying: ClientView = { ...view, step: 'buy' };
    expect(placementFor(buying, false, firstTile)).toBeNull();
  });

  it('returns null with no view', () => {
    expect(placementFor(null, false, firstTile)).toBeNull();
  });
});
