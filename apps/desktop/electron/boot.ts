import { appendFileSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { app, type BrowserWindow } from 'electron';
import { MILESTONES, WATCHDOG_MS, header, line, stallReport, type Milestone } from './bootLog.js';

/**
 * The boot log's Electron half: where it writes, and what it listens to.
 *
 * The pure formatting lives in `bootLog.ts`; this is the part that needs a real
 * `app` and a real `BrowserWindow`, and is therefore not unit tested. Keep it
 * thin enough that reading it is enough.
 *
 * Every write is **synchronous**. That is the whole point: this log exists for
 * launches that never finish, and a queued async write in a process whose
 * renderer is wedged is a write that never reaches the disk. A handful of short
 * `appendFileSync` calls per launch costs nothing against that.
 */
class BootLog {
  private startedAt = Date.now();
  private file: string | null = null;
  private pending: string[] = [];
  private reached: Milestone[] = ['process-start'];
  private watchdog: NodeJS.Timeout | null = null;

  /** A line for the log. Buffered until `open` knows where the log lives. */
  note(message: string): void {
    const text = line(Date.now() - this.startedAt, message);
    if (!this.file) {
      this.pending.push(text);
      return;
    }
    this.append(text);
  }

  /** Record a milestone; the watchdog reads these to name where a launch stalled. */
  reach(milestone: Milestone): void {
    if (this.reached.includes(milestone)) return;
    this.reached.push(milestone);
    this.note(`reached ${milestone}`);
    if (milestone === MILESTONES[MILESTONES.length - 1]) this.finish();
  }

  /**
   * Start the log for this launch.
   *
   * The previous launch is kept as `boot.prev.log` and everything older is
   * dropped. Two files is the right number: the one you want is almost always
   * the run that just failed, and the run before it is the one you want when
   * the failure was bad enough that you had to power-cycle the device to get
   * back to a state where you could read anything.
   */
  open(info: { session: string; appName: string; version: string; logDir: string }): void {
    try {
      mkdirSync(info.logDir, { recursive: true });
      const current = join(info.logDir, 'boot.log');
      const previous = join(info.logDir, 'boot.prev.log');
      rmSync(previous, { force: true });
      try {
        renameSync(current, previous);
      } catch {
        // no previous launch to keep — first run, or the log was cleared
      }
      this.file = current;
      this.append(
        header({
          app: info.appName,
          version: info.version,
          session: info.session,
          platform: `${process.platform}/${process.arch}`,
          electron: process.versions['electron'] ?? 'unknown',
          chrome: process.versions['chrome'] ?? 'unknown',
          at: new Date(),
        }),
      );
      const buffered = this.pending;
      this.pending = [];
      for (const text of buffered) this.append(text);
    } catch {
      // A log we cannot write is not a reason to fail a launch.
      this.file = null;
    }

    // A GPU process that dies is the single most likely cause of a window that
    // is up and composited but never shows a frame — which is what a nested
    // compositor like gamescope can provoke where a desktop session does not.
    // Chromium recovers from a few of these silently, so without this the only
    // symptom is the hang itself.
    app.on('child-process-gone', (_event, details) => {
      this.note(`child process gone: ${details.type} (${details.reason}, exit ${details.exitCode})`);
    });
  }

  /** Watch a window through the rest of its launch, and time it out if it stalls. */
  watch(win: BrowserWindow): void {
    win.once('ready-to-show', () => this.reach('first-paint'));
    win.on('unresponsive', () => this.note('WINDOW UNRESPONSIVE: the renderer stopped answering'));
    win.on('responsive', () => this.note('window responsive again'));

    win.webContents.on('did-finish-load', () => this.reach('renderer-loaded'));
    win.webContents.on('did-fail-load', (_event, code, description, url) => {
      this.note(`RENDERER FAILED TO LOAD: ${code} ${description} (${url})`);
    });
    win.webContents.on('render-process-gone', (_event, details) => {
      this.note(`RENDER PROCESS GONE: ${details.reason} (exit ${details.exitCode})`);
    });

    this.watchdog = setTimeout(() => {
      if (this.reached.includes('first-paint')) return;
      this.append(stallReport(this.reached, Date.now() - this.startedAt));
    }, WATCHDOG_MS);
    // Never hold the process open just to report on it.
    this.watchdog.unref?.();
  }

  private finish(): void {
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = null;
  }

  private append(text: string): void {
    if (!this.file) return;
    try {
      appendFileSync(this.file, `${text}\n`, 'utf8');
    } catch {
      // see open() — never fail a launch over the log
    }
  }
}

/** One per process; `main.ts` is the only caller. */
export const boot = new BootLog();
