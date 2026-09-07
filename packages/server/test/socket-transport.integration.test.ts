import { afterEach, describe, expect, it } from 'vitest';
import { createGameClient, socketTransport } from '@boomtown/client-core';
import type { RoomConfig } from '@boomtown/protocol';

const HOST = '127.0.0.1:1999';
const uniqueRoom = () => `st-${Math.random().toString(36).slice(2, 8)}`;

const config: RoomConfig = {
  seatCount: 3,
  edition: 'classic',
  visibility: 'open',
  bots: { 1: 6, 2: 6 },
  seed: 11,
};

const teardowns: (() => void)[] = [];
afterEach(() => {
  for (const t of teardowns.splice(0)) t();
});

/** Wait for a store predicate to hold (polling the vanilla zustand store). */
function waitFor<T>(store: { getState: () => T }, pred: (s: T) => boolean, ms = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      const s = store.getState();
      if (pred(s)) return resolve(s);
      if (Date.now() - started > ms) return reject(new Error('waitFor timed out'));
      setTimeout(tick, 25);
    };
    tick();
  });
}

describe('socketTransport — GameTransport parity against a real room', () => {
  it('satisfies the same store contract as localTransport for a scripted turn', async () => {
    const room = uniqueRoom();
    const transport = socketTransport({ host: HOST, room, name: 'Ana', intent: { kind: 'create', config } });
    const client = createGameClient(transport);
    teardowns.push(() => client.disconnect());

    await client.connect();
    // after `create`, the room sends welcome + room-state but no game update
    // until `start`. Wait for our seat assignment, then start.
    await waitFor({ getState: () => transport.seat() }, (seat) => seat === 0);
    transport.start();

    const playing = await waitFor(
      client.store,
      (s) => {
        const v = s.activeSeat != null ? s.views[s.activeSeat] : null;
        return v != null && v.status === 'playing' && v.you === 0;
      },
      10_000,
    );
    const view = playing.views[playing.activeSeat!]!;
    expect(view.you).toBe(0);
    expect(view.yourHand).toHaveLength(6);
    // legalMoves came from the room, computed server-side (not empty on our turn)
    expect(view.legalMoves.length).toBeGreaterThan(0);

    // dispatch a placement — optimistic echo set synchronously
    const tile = view.yourHand[0]!;
    client.dispatch({ type: 'place-tile', seat: 0, tile });
    expect(client.store.getState().inFlight).toEqual({ type: 'place-tile', seat: 0, tile });

    // reconciles to the authoritative view — bots then take their turns
    await waitFor(client.store, (s) => s.inFlight == null && s.log.length > 0);
  }, 25_000);

  it('surfaces a rejected command as a typed error, view untouched', async () => {
    const room = uniqueRoom();
    const transport = socketTransport({ host: HOST, room, name: 'Ana', intent: { kind: 'create', config } });
    const client = createGameClient(transport);
    teardowns.push(() => client.disconnect());
    await client.connect();
    await waitFor({ getState: () => transport.seat() }, (seat) => seat === 0);
    transport.start();
    await waitFor(client.store, (s) => {
      const v = s.activeSeat != null ? s.views[s.activeSeat] : null;
      return v?.status === 'playing' && v.you === 0;
    }, 10_000);

    // buy at the place step -> wrong-step
    client.dispatch({ type: 'buy-shares', seat: 0, picks: {} });
    const errored = await waitFor(client.store, (s) => s.lastError != null);
    expect(errored.lastError?.code).toBe('wrong-step');
    expect(errored.inFlight).toBeNull();
  }, 25_000);

  it('reconnects and restores the view after a transport drop', async () => {
    const room = uniqueRoom();
    const t1 = socketTransport({ host: HOST, room, name: 'Ana', intent: { kind: 'create', config } });
    const c1 = createGameClient(t1);
    await c1.connect();
    await waitFor({ getState: () => t1.seat() }, (seat) => seat === 0);
    t1.start();
    await waitFor(c1.store, (s) => {
      const v = s.activeSeat != null ? s.views[s.activeSeat] : null;
      return v?.status === 'playing';
    }, 10_000);
    const token = t1.token();
    expect(token).toBeTruthy();
    c1.disconnect();

    await new Promise((r) => setTimeout(r, 400));

    const t2 = socketTransport({
      host: HOST,
      room,
      name: 'Ana',
      token: token!,
      intent: { kind: 'resume' },
    });
    const c2 = createGameClient(t2);
    teardowns.push(() => c2.disconnect());
    await c2.connect();
    const restored = await waitFor(c2.store, (s) => {
      const v = s.activeSeat != null ? s.views[s.activeSeat] : null;
      return v != null && v.you === 0 && v.status === 'playing';
    }, 10_000);
    expect(restored.views[0]!.yourHand).toHaveLength(6);
  }, 25_000);

  it('connect() rejects when the room is full — a failed join is not a silent hang', async () => {
    const room = uniqueRoom();
    const small: RoomConfig = { ...config, seatCount: 2, bots: {} };
    const host = createGameClient(
      socketTransport({ host: HOST, room, name: 'Host', intent: { kind: 'create', config: small } }),
    );
    teardowns.push(() => host.disconnect());
    await host.connect();

    const p2 = createGameClient(
      socketTransport({ host: HOST, room, name: 'P2', intent: { kind: 'join' } }),
    );
    teardowns.push(() => p2.disconnect());
    await p2.connect();

    // the 3rd joiner: room is full -> connect() rejects with the room's reason
    const t3 = socketTransport({ host: HOST, room, name: 'P3', intent: { kind: 'join' } });
    teardowns.push(() => t3.disconnect());
    await expect(createGameClient(t3).connect()).rejects.toThrow(/room-full/);
  }, 20_000);
});
