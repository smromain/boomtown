import type { BrowserWindowConstructorOptions } from 'electron';

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
