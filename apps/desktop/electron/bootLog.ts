/**
 * A record of how the last launch went, written where a player can find it.
 *
 * A packaged Boomtown says nothing about its own startup. On a desktop that is
 * fine — anything that goes wrong goes wrong visibly, and a developer can run
 * the app from a terminal and read stderr. In SteamOS Game Mode neither is
 * true: there is no terminal, the window is a fullscreen surface with no
 * chrome, and a renderer that never starts looks exactly like a renderer that
 * is still loading. The bug this was written for produced no evidence at all.
 *
 * So every packaged launch now leaves a short, plain-text trail in the app's
 * log directory: the session it found itself in, each boot milestone as it is
 * reached, and — the part that matters — the reason when a milestone is never
 * reached. A hang that reproduces now names itself.
 *
 * The formatting is pure and the writer is a thin shell around it, so the
 * useful half is covered by unit tests rather than by launching Electron.
 */

/** Milestones a healthy launch passes, in order. A log that stops names the stall. */
export type Milestone =
  | 'process-start'
  | 'app-ready'
  | 'window-created'
  | 'renderer-load-started'
  | 'renderer-loaded'
  | 'first-paint';

export const MILESTONES: readonly Milestone[] = [
  'process-start',
  'app-ready',
  'window-created',
  'renderer-load-started',
  'renderer-loaded',
  'first-paint',
];

/** One line of the boot log: milliseconds since process start, then what happened. */
export function line(sinceStartMs: number, message: string): string {
  return `[${String(Math.max(0, Math.round(sinceStartMs))).padStart(6, ' ')}ms] ${message}`;
}

/**
 * The header a log opens with. Versions are here because the two environment
 * differences that could explain a Game-Mode-only hang — the graphics stack and
 * the container — are both invisible from inside the app, and knowing the
 * Electron and Chromium builds is the first thing anyone will ask.
 */
export function header(info: {
  readonly app: string;
  readonly version: string;
  readonly session: string;
  readonly platform: string;
  readonly electron: string;
  readonly chrome: string;
  readonly at: Date;
  /** The injected-environment lines from `session.launchEnvironment`. */
  readonly environment?: readonly string[];
}): string {
  return [
    `--- ${info.app} ${info.version} — ${info.at.toISOString()}`,
    `    platform: ${info.platform}, electron ${info.electron}, chrome ${info.chrome}`,
    `    session: ${info.session}`,
    ...(info.environment ?? []).map((line) => `    env ${line}`),
  ].join('\n');
}

/**
 * What to say when a launch stalls.
 *
 * `reached` is the milestones the launch got through. The first one it never
 * reached is the diagnosis, and naming it in the log saves the round trip that
 * "it just hangs" otherwise costs.
 */
export function stallReport(reached: readonly Milestone[], afterMs: number): string {
  const stuckAt = MILESTONES.find((milestone) => !reached.includes(milestone));
  if (!stuckAt) return line(afterMs, 'boot watchdog: everything reached, nothing to report');
  const last = reached.length > 0 ? reached[reached.length - 1] : 'nothing';
  return line(
    afterMs,
    `BOOT STALLED: reached '${last}', never reached '${stuckAt}'. ` +
      `See docs/steamos-game-mode.md — under gamescope this is usually the renderer ` +
      `process failing to spawn (sandbox/container) or the GPU process never presenting a frame.`,
  );
}

/** How long to wait for a launch to finish before calling it stalled. */
export const WATCHDOG_MS = 20_000;
