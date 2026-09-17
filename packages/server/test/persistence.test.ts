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
    // The adapter feeds each live connection's persisted {seat, token, name}
    // back through restoreSeat on wake; without it a human seat keeps the
    // `Seat N` placeholder the replay base was built with.
    woken!.restoreSeat(0, 'tok-a', 'Ana', 'c1');
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
    woken!.restoreSeat(0, 'tok-a', 'Ana', 'c1'); // adapter does this on wake
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

  // --- the started marker (#63) ---------------------------------------
  //
  // The window is `start()` until the first command is persisted: one human
  // opening turn. Before the marker, that wake was indistinguishable from a
  // room that never started, and the opening move was answered with "no game
  // in progress".

  /** Three human seats, started, nobody has moved: the ambiguous bytes. */
  async function startedButUnmoved(code: string) {
    const store = new MemoryStore();
    const room = new GameRoom(code, config(), store);
    await room.persistConfig();
    room.join('Ana', 't1', 'c1');
    room.join('Bo', 't2', 'c2');
    room.join('Cy', 't3', 'c3');
    const started = await room.start();
    if ('error' in started) throw new Error(`start refused: ${started.error.kind}`);
    expect(await new CommandLog(store).count()).toBe(0); // the window
    return { store, room };
  }

  it('wakes up playing when the game started and the log is still empty', async () => {
    const { store } = await startedButUnmoved('HIB01');
    const woken = await GameRoom.rehydrate('HIB01', store);
    expect(woken).not.toBeNull();
    expect(woken!.isPlaying()).toBe(true);
    expect(woken!.roomState().phase).toBe('playing');
  });

  it('accepts the first command after that wake', async () => {
    const { store } = await startedButUnmoved('HIB02');
    const woken = (await GameRoom.rehydrate('HIB02', store))!;
    woken.restoreSeat(0, 't1', 'Ana', 'c1');
    const view = currentView(woken, 0);
    if (!view) throw new Error('no view after the wake');
    const out = await woken.command(0, { type: 'place-tile', seat: 0, tile: view.yourHand[0]! });
    for (const u of out) {
      if (u.kind === 'to-seat' && u.message.type === 'error') {
        throw new Error(`the opening move was refused: ${u.message.error.kind}`);
      }
      if (u.kind === 'to-seat' && u.message.type === 'update') {
        expect(u.message.rejection).toBeUndefined();
      }
    }
    expect(await new CommandLog(store).count()).toBe(1);
  });

  it('deals the same game on that wake as the one start() dealt', async () => {
    const { store, room } = await startedButUnmoved('HIB03');
    const woken = (await GameRoom.rehydrate('HIB03', store))!;
    // Hands are the sharpest witness the deal is identical: the seed was
    // resolved once and persisted, so createGame rebuilds the same bag.
    expect(currentView(woken, 0)?.yourHand).toEqual(currentView(room, 0)?.yourHand);
    expect(currentView(woken, 1)?.yourHand).toEqual(currentView(room, 1)?.yourHand);
  });

  it('refuses a second start after that wake instead of silently re-dealing', async () => {
    const { store } = await startedButUnmoved('HIB04');
    const woken = (await GameRoom.rehydrate('HIB04', store))!;
    woken.restoreSeat(0, 't1', 'Ana', 'c1');
    woken.restoreSeat(1, 't2', 'Bo', 'c2');
    woken.restoreSeat(2, 't3', 'Cy', 'c3');
    const again = await woken.start();
    expect('error' in again && again.error.kind === 'protocol' && again.error.code).toBe(
      'game-already-started',
    );
  });

  it('refuses a start when storage says started even if the phase was lost', async () => {
    // Defence in depth: the marker is on disk, so a room whose in-memory phase
    // somehow reads `lobby` still cannot be re-dealt.
    const { store } = await startedButUnmoved('HIB05');
    const fresh = new GameRoom('HIB05', config(), store); // never rehydrated: phase is 'lobby'
    fresh.join('Ana', 't1', 'c1');
    fresh.join('Bo', 't2', 'c2');
    fresh.join('Cy', 't3', 'c3');
    const again = await fresh.start();
    expect('error' in again && again.error.kind === 'protocol' && again.error.code).toBe(
      'game-already-started',
    );
  });

  it('tells a seat the game finished, not that there is no game', async () => {
    const store = new MemoryStore();
    const room = new GameRoom('OVER1', config({ seatCount: 2, bots: { 0: 5, 1: 5 } }), store);
    await room.persistConfig();
    await room.start(); // two bots: the room plays itself out to the end
    expect(room.roomState().phase).toBe('over');
    const out = await room.command(0, { type: 'end-turn', seat: 0 });
    const error = out.flatMap((u) =>
      u.kind === 'to-seat' && u.message.type === 'update' ? [u.message.rejection?.error] : [],
    )[0];
    expect(error?.kind === 'protocol' && error.code).toBe('game-over');
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
