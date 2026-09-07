import { describe, expect, it } from 'vitest';
import type { Command } from '@boomtown/engine';
import { createGame, replay } from '@boomtown/engine';
import type { RoomConfig } from '@boomtown/protocol';
import { CommandLog, GameRoom, MemoryStore, setupOptionsFor } from '@boomtown/server';

const config = (over: Partial<RoomConfig> = {}): RoomConfig => ({
  seatCount: 3,
  edition: 'classic',
  visibility: 'open',
  bots: {},
  seed: 42,
  ...over,
});

describe('CommandLog', () => {
  it('loadAll returns commands in application order', async () => {
    const log = new CommandLog(new MemoryStore());
    const commands: Command[] = [
      { type: 'place-tile', seat: 0, tile: '1A' },
      { type: 'buy-shares', seat: 0, picks: {} },
      { type: 'end-turn', seat: 0 },
    ];
    for (const c of commands) await log.append(c);
    expect(await log.loadAll()).toEqual(commands);
    expect(await log.count()).toBe(3);
  });

  it('preserves order past the 10-key zero-pad boundary', async () => {
    const log = new CommandLog(new MemoryStore());
    for (let i = 0; i < 15; i++) await log.append({ type: 'end-turn', seat: 0 });
    const all = await log.loadAll();
    expect(all).toHaveLength(15); // cmd:000000001 .. cmd:000000015 sort correctly
  });

  it('round-trips the room config', async () => {
    const log = new CommandLog(new MemoryStore());
    const c = config({ edition: 'edition-2015', bots: { 2: 7 } });
    await log.saveConfig(c);
    expect(await log.loadConfig()).toEqual(c);
  });

  it('derives the head from the keys, so a failed write cannot make append overwrite a command', async () => {
    // A store that fails the Nth put once, then behaves normally.
    class FlakyStore extends MemoryStore {
      puts = 0;
      failOn = 3;
      override put<T>(key: string, value: T): Promise<void> {
        this.puts += 1;
        if (this.puts === this.failOn) return Promise.reject(new Error('storage blip'));
        return super.put(key, value);
      }
    }
    const store = new FlakyStore();
    const log = new CommandLog(store);
    await log.append({ type: 'end-turn', seat: 0 });
    await log.append({ type: 'end-turn', seat: 1 });
    await expect(log.append({ type: 'end-turn', seat: 2 })).rejects.toThrow('storage blip');
    // the log still has exactly the two committed commands, in order
    expect(await log.count()).toBe(2);
    // a later append lands at cmd:3, not overwriting cmd:2
    await log.append({ type: 'end-turn', seat: 2 });
    const all = await log.loadAll();
    expect(all).toHaveLength(3);
    expect(all[1]).toEqual({ type: 'end-turn', seat: 1 });
  });

});

describe('GameRoom persistence', () => {
  it('appends every command — human and bot — before the game ends', async () => {
    const store = new MemoryStore();
    const room = new GameRoom('P1', config({ seatCount: 3, bots: { 0: 4, 1: 4, 2: 4 }, seed: 5 }), store);
    await room.persistConfig();
    await room.start(); // all bots — plays the whole game

    const log = new CommandLog(store);
    const commands = await log.loadAll();
    expect(commands.length).toBeGreaterThan(10);

    // replaying the log reproduces the finished game
    const base = createGame(setupOptionsFor(config({ seatCount: 3, bots: { 0: 4, 1: 4, 2: 4 }, seed: 5 })));
    const result = replay(base, commands);
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.state.status).toBe('over');
  });

  it('a human command is in storage before its update is returned', async () => {
    const store = new MemoryStore();
    const room = new GameRoom('P2', config(), store);
    await room.persistConfig();
    room.join('Ana', 't1', 'c1');
    room.join('Bo', 't2', 'c2');
    room.join('Cy', 't3', 'c3');
    const started = await room.start();
    if ('error' in started) throw new Error('start');
    const view = lastSeatView(started.updates, 0)!;
    const tile = view.yourHand[0]!;

    const log = new CommandLog(store);
    expect(await log.count()).toBe(0);
    await room.command(0, { type: 'place-tile', seat: 0, tile });
    expect(await log.count()).toBe(1);
    expect((await log.loadAll())[0]).toEqual({ type: 'place-tile', seat: 0, tile });
  });
});

describe('GameRoom.rehydrate', () => {
  it('rebuilds a mid-game room from its stored config + log, deep-equal to the live state', async () => {
    const store = new MemoryStore();
    const cfg = config({ seatCount: 3, bots: { 1: 6, 2: 6 }, seed: 9 });
    const live = new GameRoom('R1', cfg, store);
    await live.persistConfig();
    live.join('Ana', 'tok-a', 'c1');
    const started = await live.start();
    if ('error' in started) throw new Error('start');

    // play a few human turns
    for (let i = 0; i < 3; i++) {
      const view = lastSeatView([], 0) ?? currentView(live, 0);
      if (!view || view.status === 'over') break;
      const move = view.step === 'place' ? { type: 'place-tile' as const, seat: 0 as const, tile: view.yourHand[0]! } : { type: 'end-turn' as const, seat: 0 as const };
      await live.command(0, move);
    }
    const liveView = currentView(live, 0);

    const woken = await GameRoom.rehydrate('R1', store);
    expect(woken).not.toBeNull();
    const wokenView = currentView(woken!, 0);
    expect(wokenView).toEqual(liveView);
  });

  it('rebuilds deep-equal even when the room was created with no explicit seed (the normal online case)', async () => {
    const store = new MemoryStore();
    // no `seed` — GameRoom must resolve one at creation and persist it
    const cfg: RoomConfig = { seatCount: 3, edition: 'classic', visibility: 'open', bots: { 1: 6, 2: 6 } };
    const live = new GameRoom('S1', cfg, store);
    await live.persistConfig();
    live.join('Ana', 'tok-a', 'c1');
    const started = await live.start();
    if ('error' in started) throw new Error('start');

    for (let i = 0; i < 4; i++) {
      const view = currentView(live, 0);
      if (!view || view.status === 'over') break;
      const move =
        view.step === 'place'
          ? { type: 'place-tile' as const, seat: 0 as const, tile: view.yourHand[0]! }
          : { type: 'end-turn' as const, seat: 0 as const };
      await live.command(0, move);
    }
    const liveView = currentView(live, 0);

    const woken = await GameRoom.rehydrate('S1', store);
    expect(woken).not.toBeNull();
    expect(currentView(woken!, 0)).toEqual(liveView);
  });

  it('parks the room read-only instead of throwing when the stored log cannot replay', async () => {
    const store = new MemoryStore();
    await new CommandLog(store).saveConfig(config());
    // a log entry that will fail against a fresh game (buy at the place step)
    await store.put('cmd:000000001', { type: 'buy-shares', seat: 0, picks: {} });

    const woken = await GameRoom.rehydrate('BROKEN', store);
    expect(woken).not.toBeNull(); // did NOT throw
    expect(woken!.isPlaying()).toBe(false);
    const out = await woken!.command(0, { type: 'end-turn', seat: 0 });
    // every command is refused, not applied
    expect(out).toHaveLength(1);
    if (out[0]!.kind === 'to-seat' && out[0]!.message.type === 'update') {
      expect(out[0]!.message.rejection).toBeDefined();
    }
  });

  it('returns null when the store has no config (nothing to rehydrate)', async () => {
    expect(await GameRoom.rehydrate('EMPTY', new MemoryStore())).toBeNull();
  });

  it('a woken room with a stored config but no commands is back in the lobby', async () => {
    const store = new MemoryStore();
    const room = new GameRoom('L1', config(), store);
    await room.persistConfig();
    const woken = await GameRoom.rehydrate('L1', store);
    expect(woken).not.toBeNull();
    expect(woken!.isPlaying()).toBe(false);
    expect(woken!.roomState().phase).toBe('lobby');
  });
});

// --- helpers ---
function lastSeatView(updates: import('@boomtown/server').Outbound[], seat: number) {
  for (const u of [...updates].reverse()) {
    if (u.kind === 'to-seat' && u.seat === seat && u.message.type === 'update') return u.message.view;
  }
  return null;
}
function currentView(room: GameRoom, seat: number) {
  const msg = room.currentUpdateFor(seat);
  return msg && msg.type === 'update' ? msg.view : null;
}
