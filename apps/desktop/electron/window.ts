import type { BrowserWindowConstructorOptions } from 'electron';
import type { SessionShape } from './session.js';

/**
 * The renderer's security posture (KTD9). Exported as a pure factory so U9's
 * verification — context isolation on, node integration off, sandbox on — is a
 * unit test rather than a manual check.
 */
export const MIN_WIDTH = 1024;
export const MIN_HEIGHT = 700;

export function windowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  return {
    // A fallback only — `openingBounds` overrides this with the display's work
    // area at creation. It stands in where no display is known.
    width: 1280,
    height: 860,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    backgroundColor: '#14110c',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      spellcheck: false,
      // the engine runs in a renderer Web Worker; nothing here needs Node
    },
  };
}

/** Just the part of a display's `workAreaSize` that matters here. */
export interface WorkArea {
  readonly width: number;
  readonly height: number;
}

/**
 * Constructor bounds that fill the screen the app opens on — the *work* area,
 * so the window clears the taskbar / menu bar / dock rather than hiding under
 * them. Never smaller than the minimums, so a tiny or misreported display
 * still gets a usable window.
 *
 * This is belt to `openMaximized`'s braces. `maximize()` is a request to the
 * window manager, and a session without one (a bare X server, some kiosk and
 * CI setups) simply ignores it — verified: the window stays at its
 * constructor size. Sizing it here means it fills the screen regardless, and
 * where a window manager does exist `maximize()` still flags it properly
 * maximized so the OS maximize/restore control behaves as the user expects.
 */
export function openingBounds(work: WorkArea): { width: number; height: number } {
  return {
    width: Math.max(MIN_WIDTH, Math.round(work.width)),
    height: Math.max(MIN_HEIGHT, Math.round(work.height)),
  };
}

/**
 * Constructor bounds for a gamescope session.
 *
 * Two departures from `openingBounds`. It asks for `fullscreen` up front, so
 * the surface gamescope composites is fullscreen from its first frame rather
 * than resized into place afterwards. And it does **not** floor the size at
 * `MIN_WIDTH`/`MIN_HEIGHT`: those minimums protect a layout the player could
 * otherwise drag too small, and under gamescope there is nothing to drag — the
 * output is whatever gamescope says it is. Flooring there would instead make
 * the window larger than the screen on any Game Mode resolution below
 * 1024x700, with the board's edges cropped off and no way to scroll to them.
 * The Deck's own 1280x800 clears the floor, but an external display, a
 * streamed session and gamescope's `-w/-h` do not have to.
 */
export function compositorBounds(work: WorkArea): BrowserWindowConstructorOptions {
  const width = Math.max(1, Math.round(work.width));
  const height = Math.max(1, Math.round(work.height));
  return { width, height, minWidth: Math.min(MIN_WIDTH, width), minHeight: Math.min(MIN_HEIGHT, height), fullscreen: true };
}

/**
 * The slice of `BrowserWindow` that `openMaximized` touches. Structural, so
 * the ordering below is a unit test instead of something only a packaged
 * build would reveal.
 */
export interface Maximizable {
  maximize(): void;
  show(): void;
  once(event: 'ready-to-show', listener: () => void): unknown;
}

/**
 * Open filling the screen — maximized, not true fullscreen: the window keeps
 * its title bar and the OS chrome, and the user can restore it as normal.
 *
 * `maximize()` runs synchronously at creation rather than on `ready-to-show`,
 * because outside smoke mode the window is constructed with `show: true`
 * (`main.ts`) — deferring would put it on screen at its constructor size and
 * visibly pop a frame later.
 *
 * Nothing persists window bounds, so this is unconditional: every launch opens
 * the same way.
 */
export function openMaximized(win: Maximizable): void {
  win.maximize();
  win.once('ready-to-show', () => win.show());
}

/**
 * The slice of `BrowserWindow` a fullscreen open touches.
 */
export interface Fullscreenable {
  setFullScreen(flag: boolean): void;
  show(): void;
  once(event: 'ready-to-show', listener: () => void): unknown;
}

/**
 * Open the window the way the session it landed in can actually present it.
 *
 * On a desktop that is `openMaximized` — a normal window filling the work area,
 * with the title bar and the OS controls the player expects.
 *
 * Under gamescope it is true fullscreen, and the difference is not cosmetic.
 * gamescope draws no decorations and has no taskbar, so a *maximized* Boomtown
 * in Steam Deck Game Mode is a window with no close button, nothing to switch
 * to, and no way to restore or move it — the player's only exit is Steam's own
 * force-quit. Worse, a window that is not fullscreen is not reliably the
 * surface gamescope chooses to show, which is one way a running, healthy app
 * presents as a black screen that never finishes loading. Asking for fullscreen
 * states the intent in the one term gamescope is built around.
 *
 * `fullscreen` is also set in the constructor options (`compositorBounds`);
 * this is the same belt-and-braces as `openMaximized`, for the same reason —
 * a compositor is free to ignore a constructor hint and honour the later
 * request, or the reverse.
 */
export function openForSession(win: Maximizable & Fullscreenable, session: Pick<SessionShape, 'gamescope'>): void {
  if (session.gamescope) {
    win.setFullScreen(true);
    win.once('ready-to-show', () => win.show());
    return;
  }
  openMaximized(win);
}

/**
 * Where the window icon lives, packaged and in development.
 *
 * Windows and Linux draw this in the taskbar and the window switcher; without
 * it they fall back to the stock Electron logo. macOS ignores it and uses the
 * bundle's own icon, which electron-builder generates from the same file.
 *
 * Packaged, the icon is copied next to the app by the `extraResources` entry in
 * `electron-builder.yml`. In development it is read from the repo's
 * `apps/desktop/build/` — the main process runs out of `out/main/`, two levels
 * below it — so `npm run dev` shows the same icon a release does.
 */
export function iconPath(env: {
  readonly packaged: boolean;
  readonly resourcesPath: string;
  readonly mainDir: string;
}): string {
  return env.packaged
    ? `${env.resourcesPath}/icon.png`
    : `${env.mainDir}/../../build/icon.png`;
}
