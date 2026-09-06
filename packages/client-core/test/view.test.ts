import { describe, expect, it } from 'vitest';
import { GameSession, clientView } from '@boomtown/client-core';

const setup = { seats: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], seed: 42, turnOrder: [0, 1, 2] } as const;

describe('clientView', () => {
  it('gives the active seat its legal moves and none to the others', () => {
    const session = new GameSession(setup);
    const views = session.viewsFor([0, 1, 2]);
    expect(views[0]!.legalMoves.length).toBeGreaterThan(0);
    expect(views[0]!.legalMoves.every((m) => m.type === 'place-tile' || m.type === 'end-turn')).toBe(true);
    expect(views[1]!.legalMoves).toEqual([]);
    expect(views[2]!.legalMoves).toEqual([]);
  });

  it('labels every hand tile with what placing it would do', () => {
    const session = new GameSession(setup);
    const { handTiles } = session.viewsFor([0])[0]!;
    expect(handTiles).toHaveLength(6);
    // an empty board — every first placement touches nothing
    expect(handTiles.every((t) => t.effect === 'nothing' && t.playable)).toBe(true);
  });

  it('marks a tile that would merge two safe corporations as dead and unplayable', () => {
    const state = new GameSession(setup).snapshot();
    // seed two safe corporations either side of column 2, row B
    for (const [industry, col] of [['video', 1], ['books', 3]] as const) {
      const corp = state.corporations[industry];
      corp.founded = true;
      corp.tiles = Array.from({ length: 11 }, (_, r) => `${col}${'ABCDEFGHI'[r % 9]}`);
      for (const tile of corp.tiles) state.cells[tile] = { kind: 'corporation', industry };
    }
    state.cells['1A'] = { kind: 'corporation', industry: 'video' };
    state.cells['3A'] = { kind: 'corporation', industry: 'books' };
    state.hands[0] = ['2A'];

    const view = clientView(state, 0);
    expect(view.handTiles[0]).toEqual({ tile: '2A', effect: 'dead', playable: false });
  });
});
