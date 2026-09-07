import { describe, expect, it } from 'vitest';
import {
  GameSession,
  attachBotDriver,
  createGameClient,
  localTransport,
  type BotStuckReport,
} from '@boomtown/client-core';

const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function bench() {
  const setup = { seats: [{ name: 'A' }, { name: 'B' }], seed: 7, turnOrder: [0, 1] };
  const session = new GameSession(setup);
  const client = createGameClient(localTransport({ setup, controls: [0, 1], engine: session }));
  return { session, client, setup };
}

describe('bot driver robustness', () => {
  it('an unrelated store-write cadence faster than thinkMs does not starve the bot', async () => {
    const { session, client } = bench();
    const detach = attachBotDriver(client, {
      bots: [{ seat: 0, level: 5 }],
      snapshot: () => session.snapshot(),
      seed: 1,
      thinkMs: 40,
    });
    await client.connect();

    // hammer the store every 5ms — far faster than thinkMs (40ms). The old
    // driver cancelled and rescheduled its timer on every write, so it never fired.
    const hammer = setInterval(() => {
      client.store.setState((s) => ({ ...s, lastError: s.lastError }));
    }, 5);

    // the bot should still get its opening turn in
    for (let i = 0; i < 400 && client.store.getState().log.length === 0; i++) await flush();
    clearInterval(hammer);
    expect(client.store.getState().log.length).toBeGreaterThan(0);
    detach();
  });

  it('a decision that throws is caught and reported, and the driver recovers', async () => {
    const { session, client } = bench();
    const reports: BotStuckReport[] = [];
    let boom = true;
    const detach = attachBotDriver(client, {
      bots: [{ seat: 0, level: 5 }],
      // the policy reads state through snapshot(); make it throw once
      snapshot: () => {
        if (boom) throw new Error('kaboom in the engine');
        return session.snapshot();
      },
      seed: 1,
      thinkMs: 10,
      onStuck: (r) => reports.push(r),
    });
    await client.connect();

    for (let i = 0; i < 50 && reports.length === 0; i++) await wait(10);
    expect(reports[0]).toMatchObject({ reason: 'threw', seat: 0 });

    // the driver is still subscribed: stop throwing, poke the store, it recovers
    boom = false;
    client.store.setState((s) => ({ ...s }));
    for (let i = 0; i < 100 && client.store.getState().log.length === 0; i++) await wait(5);
    expect(client.store.getState().log.length).toBeGreaterThan(0);
    detach();
  }, 8000);

  it('the watchdog reports (and force-retries) a bot owed a move whose timer never fires', async () => {
    const { session, client } = bench();
    const reports: BotStuckReport[] = [];

    // A think delay so long the normal timer will not fire during the test —
    // stands in for "the timer got starved / lost". The watchdog window is
    // max(4000, thinkMs*20) but its poll cadence is short, so it still fires
    // at ~4s regardless of thinkMs.
    const detach = attachBotDriver(client, {
      bots: [{ seat: 0, level: 5 }],
      snapshot: () => session.snapshot(),
      seed: 1,
      thinkMs: 999_999, // the normal timer will not fire in this test
      watchdogMs: 800,
      onStuck: (r) => reports.push(r),
    });
    await client.connect();

    await wait(1500);
    expect(reports.some((r) => r.reason === 'watchdog' && r.seat === 0)).toBe(true);
    // and the forced retry actually moved the game on
    expect(client.store.getState().log.length).toBeGreaterThan(0);
    detach();
  }, 9000);
});
