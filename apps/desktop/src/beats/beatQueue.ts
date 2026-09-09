import type { Beat } from './beatTriggers.js';

/**
 * Beats queue with skip-to-latest (KTD7): a hot-seat table taking several
 * quick turns (or a bot streak) must never stall behind a backlog of beats.
 * `active` is what's on screen; `pending` holds what's queued behind it.
 */
export interface BeatQueue {
  readonly active: Beat | null;
  readonly pending: readonly Beat[];
}

export const EMPTY_BEAT_QUEUE: BeatQueue = { active: null, pending: [] };

/**
 * Add a beat. If nothing is playing, it becomes active immediately; otherwise
 * it joins `pending`, which never holds more than one beat behind the active
 * one — a second arrival collapses straight to the most recent (KTD7's
 * skip-to-latest). The merger beat is the load-bearing moment (F1): a collapse
 * keeps it over a lesser beat that arrived after it instead of dropping it,
 * so it survives any number of further collapses until it plays.
 */
export function enqueue(queue: BeatQueue, beat: Beat): BeatQueue {
  if (queue.active == null) return { active: beat, pending: [] };
  return { ...queue, pending: collapse([...queue.pending, beat]) };
}

function collapse(pending: readonly Beat[]): readonly Beat[] {
  if (pending.length <= 1) return pending;
  const latest = pending[pending.length - 1]!;
  const merger = pending.find((b) => b.id === 'merger');
  if (merger && merger !== latest) return [merger, latest];
  return [latest];
}

/** Dismiss the active beat and promote the next pending one, if any. */
export function advance(queue: BeatQueue): BeatQueue {
  const [next, ...rest] = queue.pending;
  return { active: next ?? null, pending: rest };
}
