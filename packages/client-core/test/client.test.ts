import { describe, expect, it } from 'vitest';
import { createGameClient, localTransport, type GameClient } from '@boomtown/client-core';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function client(visibility?: 'open' | 'hidden'): Promise<GameClient> {
  const transport = localTransport({
    setup: {
      seats: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
      seed: 42,
      turnOrder: [0, 1, 2],
      ...(visibility ? { visibility } : {}),
    },
    controls: [0, 1, 2],
  });
  const c = createGameClient(transport);
  await c.connect();
  return c;
}

describe('createGameClient', () => {
  it('starts connecting, then becomes ready with the active seat set', async () => {
    const c = await client();
    const state = c.store.getState();
    expect(state.status).toBe('ready');
    expect(state.activeSeat).toBe(0);
  });

  it('sets the optimistic echo synchronously on dispatch, then clears it on the authoritative reply', async () => {
    const c = await client();
    const tile = c.store.getState().views[0]!.yourHand[0]!;
    const command = { type: 'place-tile' as const, seat: 0, tile };

    c.dispatch(command);
    expect(c.store.getState().inFlight).toEqual(command); // synchronous

    await flush();
    expect(c.store.getState().inFlight).toBeNull();
    expect(c.store.getState().views[0]!.step).toBe('buy');
  });

  it('a rejected command rolls the echo back and surfaces the typed error', async () => {
    const c = await client();
    c.dispatch({ type: 'buy-shares', seat: 0, picks: {} }); // wrong step

    await flush();
    const state = c.store.getState();
    expect(state.inFlight).toBeNull();
    expect(state.lastError?.code).toBe('wrong-step');
    expect(state.views[0]!.step).toBe('place'); // unchanged
  });

  it('clears a prior error on the next dispatch', async () => {
    const c = await client();
    c.dispatch({ type: 'buy-shares', seat: 0, picks: {} });
    await flush();
    expect(c.store.getState().lastError).not.toBeNull();

    c.dispatch({ type: 'place-tile', seat: 0, tile: c.store.getState().views[0]!.yourHand[0]! });
    expect(c.store.getState().lastError).toBeNull(); // synchronous on dispatch
  });

  it('passes the table visibility setting straight through from the engine view', async () => {
    const hidden = await client('hidden');
    expect(hidden.store.getState().views[0]!.seats[1]?.cash).toBeNull();

    const open = await client('open');
    expect(open.store.getState().views[0]!.seats[1]?.cash).toBe(6000);
  });

  it('disconnect detaches the store from further updates', async () => {
    const c = await client();
    c.disconnect();
    const snapshot = c.store.getState();
    c.dispatch({ type: 'place-tile', seat: 0, tile: snapshot.views[0]!.yourHand[0]! });
    await flush();
    expect(c.store.getState().views[0]!.step).toBe(snapshot.views[0]!.step);
  });
});
