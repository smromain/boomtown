import { describe, expect, it } from 'vitest';
import { GameSession, attachBotDriver, createGameClient, localTransport, type GameClient } from '@boomtown/client-core';
import type { Command, Industry } from '@boomtown/engine';
import { YOU, allows, companiesOf, rivalMove, stepOf, tutorialGame, tutorialSetup, type Step } from './script.js';

const NAMES = { you: 'You', rivals: ['Mae', 'Dot'] as [string, string] };

/** A live tutorial table: the scripted rivals on a real bot driver, you driven by the test. */
async function table() {
  const session = new GameSession({ start: tutorialGame(NAMES) });
  const client = createGameClient(
    localTransport({ setup: tutorialSetup(NAMES), controls: [0, 1, 2], engine: session }),
  );
  const driver = attachBotDriver(client, {
    bots: [1, 2].map((seat) => ({ seat, level: 3, script: rivalMove })),
    snapshot: () => session.snapshot(),
    thinkMs: 0,
    seed: 1,
  });
  await client.connect();
  return { client, session, driver };
}

/** Wait until the table needs you (or is over), and say which step that is. */
async function yourMove(client: GameClient): Promise<Step> {
  for (let i = 0; i < 500; i++) {
    const state = client.store.getState();
    const owed = state.pendingDecision?.seat ?? state.activeSeat;
    const step = stepOf(state, true);
    if (state.inFlight == null && (step === 'over' || (owed === YOU && step !== 'merger'))) return step;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const s = client.store.getState();
  throw new Error(`stalled at ${stepOf(s, true)} ${JSON.stringify(s.pendingDecision)} ${s.activeSeat} ${s.views[YOU]?.step} ${JSON.stringify(s.lastError)}`);
}

async function send(client: GameClient, command: Command) {
  const step = stepOf(client.store.getState(), true);
  expect(allows(step, command, client.store.getState())).toBe(true);
  client.dispatch(command);
  for (let i = 0; i < 50 && client.store.getState().inFlight; i++) await new Promise((r) => setTimeout(r, 0));
  expect(client.store.getState().lastError).toBeNull();
}

describe('tutorial script', () => {
  it('starts with one safe company and no way to end yet', () => {
    const state = tutorialGame(NAMES);
    expect(state.corporations.energy.tiles).toHaveLength(11);
    expect(state.corporations.tech.tiles).toHaveLength(7);
    // Nothing is dealt twice.
    const all = [...Object.keys(state.cells), ...state.hands.flat(), ...state.bag];
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(108);
  });

  it.each<[Industry, number, Partial<Record<Industry, number>>, 'sell' | 'trade' | 'hold']>([
    ['books', 3, { tech: 2 }, 'trade'],
    ['air', 1, {}, 'sell'],
    ['toys', 2, { tech: 3 }, 'hold'],
    ['video', 3, { energy: 3 }, 'sell'],
  ])('plays through to the end when you found %s', async (pick, first, second, dispose) => {
    const { client, session, driver } = await table();

    expect(await yourMove(client)).toBe('place');
    expect(allows('place', { type: 'place-tile', seat: YOU, tile: '1I' }, client.store.getState())).toBe(false);
    await send(client, { type: 'place-tile', seat: YOU, tile: '7F' });
    expect(await yourMove(client)).toBe('found');
    await send(client, { type: 'found-corporation', seat: YOU, industry: pick, hqTile: '7F' });
    expect(await yourMove(client)).toBe('buy');
    expect(allows('buy', { type: 'buy-shares', seat: YOU, picks: {} }, client.store.getState())).toBe(false);
    await send(client, { type: 'buy-shares', seat: YOU, picks: { [pick]: first } });

    expect(await yourMove(client)).toBe('grow');
    await send(client, { type: 'place-tile', seat: YOU, tile: '6G' });
    expect(await yourMove(client)).toBe('buyMore');
    await send(client, { type: 'buy-shares', seat: YOU, picks: second });

    expect(await yourMove(client)).toBe('merge');
    expect(companiesOf(client.store.getState()).yours).toBe(pick);
    await send(client, { type: 'place-tile', seat: YOU, tile: '8F' });
    expect(await yourMove(client)).toBe('dispose');
    const shares = 1 + first;
    const even = shares - (shares % 2);
    await send(client, {
      type: 'dispose-shares',
      seat: YOU,
      hold: dispose === 'hold' ? shares : dispose === 'trade' ? shares - even : 0,
      sell: dispose === 'sell' ? shares : 0,
      trade: dispose === 'trade' ? even : 0,
    });
    expect(await yourMove(client)).toBe('safe');
    expect(companiesOf(client.store.getState()).yours).toBe(pick);
    await send(client, { type: 'buy-shares', seat: YOU, picks: {} });
    expect(await yourMove(client)).toBe('motion');
    expect(allows('motion', { type: 'end-turn', seat: YOU }, client.store.getState())).toBe(false);
    await send(client, { type: 'move-to-liquidate', seat: YOU });

    expect(await yourMove(client)).toBe('over');
    const state = session.snapshot();
    expect(state.status).toBe('over');
    // You held the most of the company that was taken over, and are paid for it.
    const log = client.store.getState().log;
    const takeover = log.find((e) => e.type === 'bonus-paid' && e.defunct === pick);
    expect(takeover?.type === 'bonus-paid' && takeover.payouts.find((p) => p.seat === YOU)?.tier).toBe('primary');
    expect(state.result?.winners).toEqual([YOU]);
    driver.detach();
  });
});
