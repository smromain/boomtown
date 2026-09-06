import { describe, expect, it } from 'vitest';
import { GameSession } from '@boomtown/client-core';

const setup = { seats: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], seed: 7, turnOrder: [0, 1, 2] } as const;

describe('GameSession', () => {
  it('applies a legal command and advances its own state', () => {
    const session = new GameSession(setup);
    const hand = session.viewsFor([0])[0]!.yourHand;
    const result = session.apply({ type: 'place-tile', seat: 0, tile: hand[0]! });
    expect(result.ok).toBe(true);
    expect(session.viewsFor([0])[0]!.step).toBe('buy');
  });

  it('rejects an illegal command without changing state', () => {
    const session = new GameSession(setup);
    const before = session.snapshot();
    const result = session.apply({ type: 'buy-shares', seat: 0, picks: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('wrong-step');
    expect(session.snapshot()).toBe(before);
  });

  it('viewsFor returns one filtered view per requested seat and hides other hands', () => {
    const session = new GameSession(setup);
    const views = session.viewsFor([0, 1, 2]);
    expect(Object.keys(views)).toEqual(['0', '1', '2']);
    expect(views[0]!.yourHand).toHaveLength(6);
    expect(views[0]!.seats[1]?.handCount).toBe(6);
    expect(views[0]).not.toHaveProperty('hands');
  });

  it('round-trips through a snapshot', () => {
    const session = new GameSession(setup);
    session.apply({ type: 'place-tile', seat: 0, tile: session.viewsFor([0])[0]!.yourHand[0]! });
    const restored = GameSession.fromSnapshot(session.snapshot());
    expect(restored.viewsFor([0])[0]!.step).toBe('buy');
  });
});
