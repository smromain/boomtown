import { describe, expect, it, vi } from 'vitest';
import { GameSession, attachBotDriver, createGameClient, localTransport } from '@boomtown/client-core';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

interface BotGame {
  setup: Parameters<typeof localTransport>[0]['setup'];
}

function makeGame(bots: readonly number[], opts?: { seed?: number; thinkMs?: number }) {
  const setup: BotGame['setup'] = {
    seats: [{ name: 'S0' }, { name: 'S1' }, { name: 'S2' }],
    seed: opts?.seed ?? 42,
    turnOrder: [0, 1, 2],
  };
  const session = new GameSession(setup);
  const client = createGameClient(
    localTransport({ setup, controls: [0, 1, 2], engine: session }),
  );
  const detach = attachBotDriver(client, {
    bots: bots.map((seat) => ({ seat, level: 8 })),
    snapshot: () => session.snapshot(),
    seed: 1,
    thinkMs: opts?.thinkMs ?? 0,
  });
  return { client, session, detach };
}

describe('attachBotDriver', () => {
  it('leaves a human active seat untouched', async () => {
    const { client, detach } = makeGame([1, 2]); // seat 0 is human
    await client.connect();
    await flush();
    await tick();
    await flush();
    expect(client.store.getState().activeSeat).toBe(0);
    expect(client.store.getState().views[0]!.step).toBe('place');
    detach();
  });

  it('drives a bot seat through its whole turn and passes to the next', async () => {
    const { client, detach } = makeGame([0, 1, 2]);
    await client.connect();

    for (let i = 0; i < 200 && client.store.getState().activeSeat === 0; i++) {
      await flush();
    }
    // the game moved past seat 0's opening turn on its own
    expect(client.store.getState().activeSeat).not.toBe(0);
    detach();
  });

  it('runs an all-bot game to a ranked result', async () => {
    const { client, session, detach } = makeGame([0, 1, 2], { seed: 5 });
    await client.connect();

    for (let i = 0; i < 6000 && client.store.getState().status !== 'over'; i++) {
      await flush();
    }
    expect(client.store.getState().status).toBe('over');
    expect(session.snapshot().result!.rankings).toHaveLength(3);
    detach();
  });

  it('stops dispatching after detach', async () => {
    const { client, detach } = makeGame([0, 1, 2], { thinkMs: 20 });
    await client.connect();
    await flush(); // driver has scheduled seat 0's move on the 20ms timer

    detach();
    const dispatchSpy = vi.spyOn(client, 'dispatch');
    await tick();
    await tick();
    await tick();
    await tick();
    await tick();
    expect(dispatchSpy).not.toHaveBeenCalled();
  });
});
