import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/storage.js';
import {
  ACTIVITY_KEY,
  LIFECYCLE,
  atCommandCeiling,
  isIdle,
  lastActivity,
  purge,
  touch,
  type AlarmStore,
} from '../src/lifecycle.js';

/** Records what the room asked the runtime to schedule. */
function fakeAlarms(): AlarmStore & { armed: number[] } {
  const armed: number[] = [];
  return { armed, setAlarm: (t: number) => { armed.push(t); return Promise.resolve(); } };
}

describe('the idle deadline', () => {
  it('moves out on every message, so a room in play never ages out', async () => {
    const store = new MemoryStore();
    const alarms = fakeAlarms();
    await touch(store, alarms, 1_000);
    await touch(store, alarms, 60_000);
    expect(await lastActivity(store)).toBe(60_000);
    expect(alarms.armed).toEqual([
      1_000 + LIFECYCLE.idleExpiryMs,
      60_000 + LIFECYCLE.idleExpiryMs,
    ]);
  });

  it('counts a room idle only once the whole window has passed', () => {
    const last = 1_000;
    expect(isIdle(last, last + LIFECYCLE.idleExpiryMs - 1)).toBe(false);
    expect(isIdle(last, last + LIFECYCLE.idleExpiryMs)).toBe(true);
  });

  it('treats a room with no activity stamp at all as idle', () => {
    // It predates this bookkeeping or never saw a message; either way nothing
    // is playing in it, and leaving it forever is the failure mode to avoid.
    expect(isIdle(null, 0)).toBe(true);
  });

  it('works without an alarm runtime rather than throwing', async () => {
    const store = new MemoryStore();
    await touch(store, null, 500);
    expect(await lastActivity(store)).toBe(500);
  });
});

describe('purging an expired room', () => {
  it('leaves nothing behind, so the address looks like one that never existed', async () => {
    const store = new MemoryStore();
    await store.put('config', { seatCount: 3 });
    await store.put('cmd:000000001', { type: 'place-tile' });
    await store.put('cmd:000000002', { type: 'end-turn' });
    await touch(store, null, 10);

    const deleted = await purge(store);

    expect(deleted).toBe(4);
    expect((await store.list({})).size).toBe(0);
    expect(await store.get('config')).toBeUndefined();
    expect(await store.get(ACTIVITY_KEY)).toBeUndefined();
  });

  it('is safe to run on a room that holds nothing', async () => {
    expect(await purge(new MemoryStore())).toBe(0);
  });
});

describe('the command ceiling', () => {
  it('sits far above the longest plausible game', () => {
    // The integration test plays three seats to a ranked result in ~70
    // commands. If this ever needs raising for a real game, the game changed.
    expect(LIFECYCLE.maxCommands).toBeGreaterThan(70 * 10);
  });

  it('lets a whole game through and stops a room that will not end', () => {
    expect(atCommandCeiling(0)).toBe(false);
    expect(atCommandCeiling(500)).toBe(false);
    expect(atCommandCeiling(LIFECYCLE.maxCommands - 1)).toBe(false);
    expect(atCommandCeiling(LIFECYCLE.maxCommands)).toBe(true);
  });
});
