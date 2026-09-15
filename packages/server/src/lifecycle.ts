import type { KeyValueStore } from './storage.js';

/**
 * How long a room lives and how much it may accumulate.
 *
 * Without these a room is immortal and its command log unbounded — invisible
 * until it is a bill, and reachable by anyone who can open a socket. Both
 * ceilings are far above any real game, so the only sessions that meet them
 * are the ones that should be stopped.
 */
export const LIFECYCLE = {
  /**
   * Commands one room will ever accept.
   *
   * A six-seat game with long mergers runs a few hundred; the integration test
   * plays three seats to a ranked result in about seventy. Five thousand is an
   * order of magnitude past the longest plausible game, so a room that reaches
   * it is not playing one.
   */
  maxCommands: 5000,
  /**
   * Idle time after which a room deletes itself, in milliseconds.
   *
   * Long enough to survive a meal, an argument about a merger, or a player
   * going to find their charger; short enough that abandoned rooms do not
   * accumulate storage forever. A room in active play never approaches it —
   * every message pushes the deadline out.
   */
  idleExpiryMs: 6 * 60 * 60 * 1000,
} as const;

/** Whether a room has accepted all the commands it ever will. */
export function atCommandCeiling(count: number): boolean {
  return count >= LIFECYCLE.maxCommands;
}

/** Where the last-activity stamp lives in room storage. */
export const ACTIVITY_KEY = 'activity';

/**
 * PartyKit's storage also carries the room's alarm. Narrowed like
 * `KeyValueStore` so the lifecycle can be exercised against a fake.
 */
export interface AlarmStore {
  setAlarm(timestamp: number): Promise<void>;
  deleteAlarm?(): Promise<void>;
}

/** Stamp the room as active now, and arm the alarm that will outlive this message. */
export async function touch(store: KeyValueStore, alarms: AlarmStore | null, now: number): Promise<void> {
  await store.put(ACTIVITY_KEY, now);
  // Re-arming on every message is what makes an active room immortal and an
  // abandoned one finite, with no timer to keep and nothing to poll.
  await alarms?.setAlarm(now + LIFECYCLE.idleExpiryMs);
}

export async function lastActivity(store: KeyValueStore): Promise<number | null> {
  const value = await store.get<number>(ACTIVITY_KEY);
  return typeof value === 'number' ? value : null;
}

/**
 * Whether a room has been idle long enough to delete. A room with no stamp at
 * all is treated as idle: it predates this bookkeeping or never saw a message,
 * and either way nothing is playing in it.
 */
export function isIdle(last: number | null, now: number): boolean {
  if (last === null) return true;
  return now - last >= LIFECYCLE.idleExpiryMs;
}

/**
 * Delete everything this room holds. Afterwards the address behaves exactly
 * like one that never existed — which is the point: an expired room should not
 * be distinguishable from an unknown one.
 */
export async function purge(store: KeyValueStore): Promise<number> {
  const all = await store.list({});
  let deleted = 0;
  for (const key of all.keys()) {
    await store.delete(key);
    deleted += 1;
  }
  return deleted;
}
