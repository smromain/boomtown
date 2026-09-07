import { describe, expect, it } from 'vitest';
import type { RoomConfig } from '@boomtown/protocol';
import { GameRoom, MemoryStore, SeatTable, configError, seatOnClock, setupOptionsFor } from '@boomtown/server';
import { createGame } from '@boomtown/engine';

const baseConfig = (over: Partial<RoomConfig> = {}): RoomConfig => ({
  seatCount: 3,
  edition: 'classic',
  visibility: 'open',
  bots: {},
  seed: 42,
  ...over,
});

describe('SeatTable', () => {
  it('fills open human seats in order, skipping bot seats', () => {
    const table = new SeatTable(baseConfig({ seatCount: 4, bots: { 1: 5 } }));
    expect(table.join('Ana', 't1', 'c1')).toEqual({ seat: 0 });
    expect(table.join('Bo', 't2', 'c2')).toEqual({ seat: 2 }); // seat 1 is a bot
    expect(table.join('Cy', 't3', 'c3')).toEqual({ seat: 3 });
    expect(table.join('Di', 't4', 'c4')).toBeNull(); // full
  });

  it('reports full only when every human seat is taken', () => {
    const table = new SeatTable(baseConfig({ seatCount: 3, bots: { 2: 8 } }));
    expect(table.allSeatsFilled()).toBe(false);
    table.join('Ana', 't1', 'c1');
    expect(table.allSeatsFilled()).toBe(false);
    table.join('Bo', 't2', 'c2');
    expect(table.allSeatsFilled()).toBe(true); // seats 0,1 human + seat 2 bot
  });

  it('re-binds a disconnected seat by token, not by connection', () => {
    const table = new SeatTable(baseConfig());
    const { seat } = table.join('Ana', 'tok-a', 'conn-1')!;
    table.disconnect('conn-1');
    expect(table.seatForConnection('conn-1')).toBeNull();
    expect(table.reconnect('tok-a', 'conn-2')).toEqual({ seat });
    expect(table.seatForConnection('conn-2')).toBe(seat);
  });

  it('rejects a reconnect with an unknown token', () => {
    const table = new SeatTable(baseConfig());
    table.join('Ana', 'tok-a', 'conn-1');
    expect(table.reconnect('tok-wrong', 'conn-2')).toBeNull();
  });
});

describe('configError', () => {
  it('accepts a plain 3-seat game', () => {
    expect(configError(baseConfig())).toBeNull();
  });
  it('rejects an out-of-range seat count', () => {
    expect(configError(baseConfig({ seatCount: 7 }))).toMatch(/seat count/);
    expect(configError(baseConfig({ seatCount: 1 }))).toMatch(/seat count/);
  });
  it('rejects a bot on a seat that does not exist', () => {
    expect(configError(baseConfig({ seatCount: 3, bots: { 5: 5 } }))).toMatch(/out of range/);
  });
  it('rejects a bot difficulty outside 1–10', () => {
    expect(configError(baseConfig({ bots: { 0: 0 } }))).toMatch(/difficulty/);
    expect(configError(baseConfig({ bots: { 0: 11 } }))).toMatch(/difficulty/);
  });
});

describe('setupOptionsFor', () => {
  it('maps edition and visibility through to the engine setup', () => {
    const options = setupOptionsFor(baseConfig({ edition: 'edition-2015', visibility: 'hidden' }));
    expect(options.visibility).toBe('hidden');
    expect(options.seats).toHaveLength(3);
    expect(options.turnOrder).toEqual([0, 1, 2]);
  });
});

describe('seatOnClock', () => {
  it('is the active seat during an ordinary turn, null when over', () => {
    const game = createGame(setupOptionsFor(baseConfig()));
    expect(seatOnClock(game)).toBe(game.turnOrder[game.turnPointer]);
    const over = { ...game, status: 'over' as const };
    expect(seatOnClock(over)).toBeNull();
  });
});

describe('GameRoom — start and turns', () => {
  function room(config: RoomConfig = baseConfig()) {
    return new GameRoom('ABCD12', config, new MemoryStore());
  }

  it('will not start until every human seat is filled', async () => {
    const r = room();
    r.join('Ana', 't1', 'c1');
    r.join('Bo', 't2', 'c2');
    expect('error' in (await r.start())).toBe(true); // seat 2 still open
    r.join('Cy', 't3', 'c3');
    expect('error' in (await r.start())).toBe(false);
  });

  it('start deals and sends each seat its own filtered view', async () => {
    const r = room();
    r.join('Ana', 't1', 'c1');
    r.join('Bo', 't2', 'c2');
    r.join('Cy', 't3', 'c3');
    const result = await r.start();
    if ('error' in result) throw new Error('should have started');
    const seatUpdates = result.updates.filter(
      (u): u is Extract<typeof u, { kind: 'to-seat' }> => u.kind === 'to-seat' && u.message.type === 'update',
    );
    expect(seatUpdates.map((u) => u.seat).sort()).toEqual([0, 1, 2]);
    for (const u of seatUpdates) {
      if (u.message.type !== 'update') continue;
      expect(u.message.view.you).toBe(u.seat);
      expect(u.message.view.yourHand).toHaveLength(6);
    }
  });

  it('rejects an out-of-turn command to the sender only, no state change', async () => {
    const r = room();
    r.join('Ana', 't1', 'c1');
    r.join('Bo', 't2', 'c2');
    r.join('Cy', 't3', 'c3');
    await r.start();

    // seat 1 acts when it is seat 0's turn
    const out = await r.command(1, { type: 'buy-shares', seat: 1, picks: {} });
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe('to-seat');
    if (out[0]!.kind === 'to-seat' && out[0]!.message.type === 'update') {
      expect(out[0]!.message.rejection?.error).toBeDefined();
    }
  });

  it('rejects an illegal command with the engine error code', async () => {
    const r = room();
    r.join('Ana', 't1', 'c1');
    r.join('Bo', 't2', 'c2');
    r.join('Cy', 't3', 'c3');
    await r.start();
    const out = await r.command(0, { type: 'buy-shares', seat: 0, picks: {} }); // wrong step
    const msg = out[0]!;
    if (msg.kind === 'to-seat' && msg.message.type === 'update' && msg.message.rejection) {
      const err = msg.message.rejection.error;
      expect(err.kind === 'engine' && err.error.code).toBe('wrong-step');
    } else {
      throw new Error('expected a rejection update');
    }
  });

  it('applies a legal placement and advances the turn', async () => {
    const r = room();
    r.join('Ana', 't1', 'c1');
    r.join('Bo', 't2', 'c2');
    r.join('Cy', 't3', 'c3');
    const started = await r.start();
    if ('error' in started) throw new Error('start');
    const seat0View = started.updates.find(
      (u) => u.kind === 'to-seat' && u.seat === 0 && u.message.type === 'update',
    );
    if (!seat0View || seat0View.kind !== 'to-seat' || seat0View.message.type !== 'update') throw new Error('view');
    const tile = seat0View.message.view.yourHand[0]!;

    const out = await r.command(0, { type: 'place-tile', seat: 0, tile });
    const seat0After = out.find((u) => u.kind === 'to-seat' && u.seat === 0);
    if (seat0After?.kind === 'to-seat' && seat0After.message.type === 'update') {
      expect(seat0After.message.view.step).toBe('buy');
    } else {
      throw new Error('expected seat-0 update');
    }
  });
});

describe('GameRoom — bots inline', () => {
  it('an all-bot room runs to a ranked result on start()', async () => {
    const r = new GameRoom('BOTS01', baseConfig({ seatCount: 3, bots: { 0: 4, 1: 4, 2: 4 }, seed: 5 }), new MemoryStore());
    // no human joins needed — all seats are bots
    const result = await r.start();
    if ('error' in result) throw new Error(`start failed: ${JSON.stringify(result.error)}`);
    expect(r.isPlaying()).toBe(false); // game already over — bots played it all
    const lastUpdate = [...result.updates].reverse().find(
      (u) => u.kind === 'to-seat' && u.message.type === 'update',
    );
    if (lastUpdate?.kind === 'to-seat' && lastUpdate.message.type === 'update') {
      expect(lastUpdate.message.view.result).not.toBeNull();
      expect(lastUpdate.message.view.result!.rankings).toHaveLength(3);
    } else {
      throw new Error('expected a final update');
    }
  });

  it('a human + 2 bots: after the human plays, the bots take their turns and control returns to the human', async () => {
    const r = new GameRoom('MIX01', baseConfig({ seatCount: 3, bots: { 1: 8, 2: 8 }, seed: 9 }), new MemoryStore());
    r.join('Ana', 't1', 'c1');
    const started = await r.start();
    if ('error' in started) throw new Error('start');

    // human is seat 0; play through its turn
    let view = seatView(started.updates, 0);
    const guard = () => view.step;
    let safety = 0;
    while (guard() !== 'end-check' && safety++ < 20) {
      const legal = view.step === 'place' ? { type: 'place-tile' as const, seat: 0 as const, tile: view.yourHand[0]! } : { type: 'buy-shares' as const, seat: 0 as const, picks: {} };
      const out = await r.command(0, legal);
      const next = seatViewMaybe(out, 0);
      if (!next) break;
      view = next;
    }
    const out = await r.command(0, { type: 'end-turn', seat: 0 });
    // bots 1 and 2 should have moved; seat 0 is active again (or game over)
    const seat0 = seatViewMaybe(out, 0);
    if (seat0) {
      expect(seat0.activeSeat === 0 || seat0.status === 'over').toBe(true);
    }
  });
});

// --- helpers ---
function seatView(updates: import('@boomtown/server').Outbound[], seat: number) {
  const v = seatViewMaybe(updates, seat);
  if (!v) throw new Error(`no update for seat ${seat}`);
  return v;
}
function seatViewMaybe(updates: import('@boomtown/server').Outbound[], seat: number) {
  for (const u of [...updates].reverse()) {
    if (u.kind === 'to-seat' && u.seat === seat && u.message.type === 'update') return u.message.view;
  }
  return null;
}
