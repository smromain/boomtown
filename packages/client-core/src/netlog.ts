/**
 * A structured, in-memory log of everything the online transport does — every
 * frame in and out, every socket lifecycle event, every subscriber that
 * attaches. Online play fails in ways a stack trace never shows (a frame that
 * arrived before anyone was listening; a room that never broadcast; a host that
 * resolved to the wrong deploy), so the fix for "it just sat there" is a
 * timeline you can read after the fact.
 *
 * It is deliberately dependency-free and DOM-free: `client-core` also runs
 * inside the PartyKit room (workerd) and inside a Web Worker.
 *
 * On by default in a dev build. In a packaged build it is off until someone
 * turns it on (Settings -> "Log online play", which writes the localStorage
 * key below), so a release pays nothing for it but a stuck player can still
 * capture a timeline.
 */

export type NetLogDirection =
  /** A frame or callback arriving from the room. */
  | 'in'
  /** A frame or call we sent to the room. */
  | 'out'
  /** A local observation: a lifecycle step, a subscription, a decision. */
  | 'note'
  /** Something went wrong. Always mirrored to the console. */
  | 'warn';

export interface NetLogEntry {
  /** Monotonic per-process sequence number — ordering survives equal timestamps. */
  readonly seq: number;
  /** Epoch milliseconds. */
  readonly at: number;
  /** Milliseconds since the first entry, which is what you actually read. */
  readonly sinceStart: number;
  /** Which layer emitted it: `socket`, `lobby`, `online`, `room`. */
  readonly scope: string;
  readonly direction: NetLogDirection;
  readonly label: string;
  /** Anything JSON-ish. Kept small — summarise before logging, don't dump views. */
  readonly detail?: Record<string, unknown>;
}

const LIMIT = 1000;
export const NETLOG_STORAGE_KEY = 'boomtown.netlog';

type Listener = (entry: NetLogEntry) => void;

const entries: NetLogEntry[] = [];
const listeners = new Set<Listener>();
let seq = 0;
let started = 0;

/** Console mirroring, so a dev build shows the timeline without opening the overlay. */
let mirror = false;
let enabled = false;

function readEnvDefault(): { on: boolean; mirror: boolean } {
  // import.meta.env exists under Vite; `process.env` under node/vitest; neither
  // in workerd. Every read is guarded — this module must never throw on import.
  let dev = false;
  try {
    const env = (import.meta as { env?: Record<string, unknown> }).env;
    // Vitest also sets DEV. A test run wants the capture available but the
    // console quiet, so it starts off and opts in explicitly.
    const underTest =
      Boolean(env?.VITEST) ||
      (typeof process !== 'undefined' && Boolean(process.env?.VITEST));
    dev = Boolean(env?.DEV) && !underTest;
  } catch {
    dev = false;
  }
  let stored: string | null = null;
  try {
    stored = typeof localStorage !== 'undefined' ? localStorage.getItem(NETLOG_STORAGE_KEY) : null;
  } catch {
    stored = null;
  }
  if (stored === 'on') return { on: true, mirror: true };
  if (stored === 'off') return { on: false, mirror: false };
  return { on: dev, mirror: dev };
}

{
  const initial = readEnvDefault();
  enabled = initial.on;
  mirror = initial.mirror;
}

export const netlog = {
  isEnabled(): boolean {
    return enabled;
  },

  /**
   * Turn capture on or off. `persist` writes the choice to localStorage so it
   * survives a reload — that is how a packaged build gets logging switched on.
   */
  setEnabled(on: boolean, persist = false): void {
    enabled = on;
    mirror = on;
    if (!persist) return;
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(NETLOG_STORAGE_KEY, on ? 'on' : 'off');
    } catch {
      // a session without localStorage keeps the in-memory choice only
    }
  },

  /** Silence the console mirror while keeping the in-memory ring buffer. */
  setMirror(on: boolean): void {
    mirror = on;
  },

  log(scope: string, direction: NetLogDirection, label: string, detail?: Record<string, unknown>): void {
    if (!enabled && direction !== 'warn') return;
    const at = Date.now();
    if (started === 0) started = at;
    const entry: NetLogEntry = {
      seq: seq++,
      at,
      sinceStart: at - started,
      scope,
      direction,
      label,
      ...(detail ? { detail } : {}),
    };
    entries.push(entry);
    if (entries.length > LIMIT) entries.splice(0, entries.length - LIMIT);
    if (mirror || direction === 'warn') {
      const arrow = direction === 'in' ? '<-' : direction === 'out' ? '->' : direction === 'warn' ? '!!' : '..';
      const line = `[net ${scope}] ${arrow} ${label}`;
      if (direction === 'warn') console.warn(line, detail ?? '');
      else console.debug(line, detail ?? '');
    }
    for (const listener of listeners) listener(entry);
  },

  /** Every entry captured so far, oldest first. */
  entries(): readonly NetLogEntry[] {
    return entries.slice();
  },

  clear(): void {
    entries.length = 0;
    started = 0;
  },

  /** Subscribe to new entries. Returns an unsubscribe. */
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** The whole timeline as pasteable text — this is what goes in a bug report. */
  asText(): string {
    return entries.map(formatEntry).join('\n');
  },
};

export function formatEntry(entry: NetLogEntry): string {
  const arrow = entry.direction === 'in' ? '<-' : entry.direction === 'out' ? '->' : entry.direction === 'warn' ? '!!' : '..';
  const stamp = `+${(entry.sinceStart / 1000).toFixed(3)}s`;
  const detail = entry.detail ? ` ${safeJson(entry.detail)}` : '';
  return `${stamp} [${entry.scope}] ${arrow} ${entry.label}${detail}`;
}

/** JSON that cannot throw and cannot flood the log with a whole game view. */
export function safeJson(value: unknown, max = 400): string {
  let text: string;
  try {
    text = JSON.stringify(value) ?? String(value);
  } catch {
    text = String(value);
  }
  return text.length > max ? `${text.slice(0, max)}…(${text.length} chars)` : text;
}
