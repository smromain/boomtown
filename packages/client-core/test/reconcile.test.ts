import { describe, expect, it } from 'vitest';
import { createGame } from '@boomtown/engine';
import { clientView, initialClientState, reconcile } from '@boomtown/client-core';
import type { ClientView, TransportMessage } from '@boomtown/client-core';

const game = createGame({ seats: [{ name: 'A' }, { name: 'B' }], seed: 1, turnOrder: [0, 1] });
const view0 = clientView(game, 0);
const view1 = clientView(game, 1);

const message = (over: Partial<TransportMessage>): TransportMessage => ({
  events: [],
  views: { 0: view0, 1: view1 },
  ...over,
});

describe('reconcile', () => {
  it('applies the authoritative views and marks the client ready', () => {
    const next = reconcile(initialClientState(), message({}));
    expect(next.status).toBe('ready');
    expect(next.views[0]).toBe(view0);
    expect(next.activeSeat).toBe(view0.activeSeat);
  });

  it('accumulates the event log across messages', () => {
    const first = reconcile(initialClientState(), message({ events: [{ type: 'turn-advanced', seat: 1 }] }));
    const second = reconcile(first, message({ events: [{ type: 'tiles-drawn', seat: 1, count: 2 }] }));
    expect(second.log.map((e) => e.type)).toEqual(['turn-advanced', 'tiles-drawn']);
  });

  it('a rejection clears the in-flight echo, surfaces the error, and keeps the last views', () => {
    const ready = reconcile(initialClientState(), message({}));
    const withEcho = { ...ready, inFlight: { type: 'buy-shares' as const, seat: 0, picks: {} } };
    const next = reconcile(withEcho, {
      events: [],
      views: {},
      rejection: { command: withEcho.inFlight!, error: { code: 'wrong-step', message: 'nope' } },
    });
    expect(next.inFlight).toBeNull();
    expect(next.lastError?.code).toBe('wrong-step');
    expect(next.views[0]).toBe(view0); // unchanged
  });

  it('surfaces a merger decision from whichever controlled seat owns it', () => {
    const deciding: ClientView = {
      ...view1,
      pendingDecision: { type: 'choose-survivor', seat: 1, options: ['books', 'video'] },
    };
    const next = reconcile(initialClientState(), message({ views: { 0: view0, 1: deciding } }));
    expect(next.pendingDecision).toEqual({ type: 'choose-survivor', seat: 1, options: ['books', 'video'] });
  });

  it('flips to over when a view reports the game finished', () => {
    const finished: ClientView = { ...view0, status: 'over' };
    const next = reconcile(initialClientState(), message({ views: { 0: finished, 1: view1 } }));
    expect(next.status).toBe('over');
  });
});
