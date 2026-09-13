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
  const driver = attachBotDriver(client, {
    bots: bots.map((seat) => ({ seat, level: 8 })),
    snapshot: () => session.snapshot(),
    seed: 1,
    thinkMs: opts?.thinkMs ?? 0,
  });
  return { client, session, detach: driver.detach, driver };
}

describe('attachBotDriver', () => {
  it('holds every bot while paused, and picks the game back up on resume', async () => {
    // The UI pauses the driver while a beat covers the screen. A bot that keeps
    // playing behind the curtain buries the moment being shown.
    const { client, driver } = makeGame([0, 1, 2]);
    await client.connect();
    await flush();
    driver.setPaused(true);

    const held = client.store.getState().log.length;
    for (let i = 0; i < 50; i++) await flush();
    expect(client.store.getState().log.length).toBe(held);
    // a nudge must not smuggle a move past the hold either
    driver.nudge();
    for (let i = 0; i < 20; i++) await flush();
    expect(client.store.getState().log.length).toBe(held);

    driver.setPaused(false);
    for (let i = 0; i < 200 && client.store.getState().log.length === held; i++) {
      await flush();
    }
    expect(client.store.getState().log.length).toBeGreaterThan(held);
    driver.detach();
  });

  it('never reports a paused bot as stuck', async () => {
    const onStuck = vi.fn();
    const session = new GameSession({ seats: [{ name: 'S0' }, { name: 'S1' }, { name: 'S2' }], seed: 42, turnOrder: [0, 1, 2] });
    const client = createGameClient(localTransport({ setup: { seats: [{ name: 'S0' }, { name: 'S1' }, { name: 'S2' }], seed: 42, turnOrder: [0, 1, 2] }, controls: [0, 1, 2], engine: session }));
    const driver = attachBotDriver(client, {
      bots: [{ seat: 0, level: 8 }],
      snapshot: () => session.snapshot(),
      seed: 1,
      thinkMs: 0,
      onStuck,
      watchdogMs: 20,
    });
    await client.connect();
    driver.setPaused(true);
    for (let i = 0; i < 60; i++) await flush();
    expect(onStuck).not.toHaveBeenCalled();
    driver.detach();
  });

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
