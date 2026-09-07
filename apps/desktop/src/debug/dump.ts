import type { BotStuckReport } from '@boomtown/client-core';
import type { Command, EngineEvent, GameState } from '@boomtown/engine';

/**
 * Dev-only diagnostic sink. Writes a game snapshot to the app's log directory
 * (via the preload bridge) so a stuck game can be replayed and root-caused.
 * A no-op in production, in tests, and when the bridge is absent.
 */
export interface DumpPayload {
  readonly when: string;
  readonly label: string;
  readonly note?: string;
  readonly state: GameState;
  readonly log?: readonly EngineEvent[];
  readonly lastCommand?: Command | null;
  readonly extra?: Record<string, unknown>;
}

const enabled = (): boolean =>
  import.meta.env.DEV && typeof window !== 'undefined' && !!window.boomtown?.debug;

export function debugDump(label: string, payload: Omit<DumpPayload, 'when' | 'label'>): void {
  if (!enabled()) return;
  const full: DumpPayload = { when: new Date().toISOString(), label, ...payload };
  // fire and forget; a failed write already logs in the main process
  void window.boomtown.debug.dump(label, full).then((file) => {
    if (file) console.warn(`[boomtown] wrote a debug snapshot: ${file}`);
  });
}

/** Wire this to `attachBotDriver`'s `onStuck`. */
export function dumpBotStuck(report: BotStuckReport, log: readonly EngineEvent[]): void {
  if (!report.state) {
    debugDump(`bot-stuck-${report.reason}`, {
      note: `bot seat ${report.seat} — ${report.reason}: snapshot() unavailable — ${String(report.error)}`,
      state: {} as unknown as GameState,
      log,
      extra: { reason: report.reason, seat: report.seat, error: String(report.error) },
    });
    return;
  }
  debugDump(`bot-stuck-${report.reason}`, {
    note: `bot seat ${report.seat} — ${report.reason}${report.error ? `: ${String(report.error)}` : ''}`,
    state: report.state,
    log,
    extra: {
      reason: report.reason,
      seat: report.seat,
      ...(report.error
        ? { error: String(report.error), stack: (report.error as Error)?.stack ?? null }
        : {}),
    },
  });
}
