import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, Menu, ipcMain, screen, session, shell } from 'electron';
import { buildCsp } from './csp.js';
import { menuTemplate } from './menu.js';
import { checkForUpdates } from './updater.js';
import { compositorBounds, iconPath, openForSession, openingBounds, windowOptions } from './window.js';
import { describeSession, extraSwitches, launchEnvironment, sessionShape } from './session.js';
import { boot } from './boot.js';

/** electron-vite sets this to the dev-server URL; absent in a packaged build. */
const rendererUrl = process.env['ELECTRON_RENDERER_URL'];
const isDev = Boolean(rendererUrl);

/** CI/headless boot check: load the window, confirm the renderer mounts, then exit. */
const smoke = process.env['BOOMTOWN_SMOKE'] === '1';

// BOOMTOWN_DEV_USER_DATA gives this instance its own profile dir (seat token in
// localStorage, window state, the singleton lock) so a second `npm run dev` can
// join the same online room as a distinct player. Dev-only; must run before
// `app.whenReady`. See "Two dev instances" in the README.
if (isDev && process.env['BOOMTOWN_DEV_USER_DATA']) {
  app.setPath('userData', process.env['BOOMTOWN_DEV_USER_DATA']);
}

/**
 * The Linux session the app was launched into. Read once, before anything
 * else: the Chromium switches below have to be appended before `app.whenReady`,
 * and every later decision about how to present the window keys off it.
 */
const shape = sessionShape();

// Open the log FIRST — before the switches, before the single-instance check,
// before `whenReady`. It used to open inside `whenReady` and behind the lock,
// which meant the two most interesting failures wrote nothing at all: a launch
// that never reached `whenReady`, and a launch the lock turned away because a
// wedged instance still held it. Both then looked exactly like "the app never
// ran", which is the one distinction the log exists to make. Nothing above this
// line may fail, so nothing above this line does anything.
boot.open({
  session: describeSession(shape),
  appName: app.name,
  version: app.getVersion(),
  logDir: logDir(),
  environment: launchEnvironment(),
});

/**
 * Electron's own log directory, or nothing if it cannot say — `boot.open` has
 * its own fallbacks and this is only the first of them. `getPath('logs')` is
 * documented for every platform but is still a call that can throw before the
 * app is ready, and throwing here would lose the log to save a path.
 */
function logDir(): string {
  try {
    return app.getPath('logs');
  } catch {
    return '';
  }
}

/**
 * Chromium switches from `BOOMTOWN_ELECTRON_FLAGS`, for bisecting a launch
 * failure on a machine that cannot be rebuilt on — a Steam Deck, mainly. Empty
 * unless the variable is set; see `session.ts` for why there are no defaults
 * and `docs/steamos-game-mode.md` for what to try.
 */
for (const { name, value } of extraSwitches()) {
  app.commandLine.appendSwitch(name, value);
  boot.note(`switch from BOOMTOWN_ELECTRON_FLAGS: --${name}${value ? `=${value}` : ''}`);
}

/**
 * One Boomtown at a time.
 *
 * Without this, a launch that hangs before it paints leaves a live process
 * holding the window, and every attempt to start the game again adds another —
 * which in Steam Deck Game Mode is precisely the state the player gets stuck
 * in: the app neither runs nor restarts, and Steam keeps showing it as
 * launching. A second launch now hands the first one the focus instead. If the
 * first is genuinely wedged, Steam's force-quit is still the way out, but
 * nothing is being made worse in the meantime.
 *
 * Not taken in development, where two instances against separate
 * `BOOMTOWN_DEV_USER_DATA` profiles is a supported workflow (see "Two dev
 * instances" in the README) and the lock would only be one more thing to get
 * right before an online game can be tested.
 */
const soleInstance = isDev || app.requestSingleInstanceLock();

if (!soleInstance) {
  // Say so. A silent quit here is indistinguishable from a crash, and while a
  // launch hang is unresolved this is a prime suspect in its own right: the
  // instance holding the lock may be a wedged one the player cannot kill, in
  // which case every relaunch lands here and the game simply never opens.
  boot.note('ANOTHER INSTANCE HOLDS THE SINGLE-INSTANCE LOCK — quitting without opening a window.');
  // Nothing else in this file should run: `whenReady` is guarded below too, so
  // a `quit` that loses the race to `ready` still cannot open a second window.
  app.quit();
} else {
  app.on('second-instance', () => {
    const [existing] = BrowserWindow.getAllWindows();
    if (!existing) return;
    if (existing.isMinimized()) existing.restore();
    existing.focus();
  });
}

function applyCsp(): void {
  // Dev escape hatch: point the dev renderer at a remote PartyKit room (e.g. the
  // deployed server) by exporting BOOMTOWN_DEV_CONNECT_SRC=wss://host,https://host
  // — the dev CSP is otherwise localhost-only. See "Dev app against the deployed
  // room" in the README. Ignored by packaged builds (isDev is false there, and
  // those already allow wss:/https:).
  const extraConnect = (process.env['BOOMTOWN_DEV_CONNECT_SRC'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const csp = buildCsp({ dev: isDev, connectSrc: extraConnect });
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });
}

function registerWindowControls(win: BrowserWindow): void {
  ipcMain.on('window:minimize', () => win.minimize());
  ipcMain.on('window:toggle-maximize', () => (win.isMaximized() ? win.unmaximize() : win.maximize()));
  ipcMain.on('window:close', () => win.close());
}

// Renderer preferences live in the renderer's own localStorage (see
// src/settings/settings.ts); these handlers remain for the window bridge's
// shape but are not load-bearing. The update check is real (U19).
ipcMain.handle('settings:get', () => ({}));
ipcMain.handle('settings:set', (_event, patch: Record<string, unknown>) => patch);
ipcMain.handle('update:check', () => checkForUpdates());

// Dev-only diagnostic: dump a game-state snapshot to disk so a stuck game (a
// bot that never moves, a rejected command) can be replayed and root-caused.
// Silently does nothing in a packaged build.
//
// In dev, electron-vite runs with cwd = apps/desktop, so dumps land in
// apps/desktop/debug-dumps/ right in the repo (gitignored) where they are easy
// to find — the app's platform log dir is unpredictable under `electron-vite dev`.
const debugDumpDir = join(process.cwd(), 'debug-dumps');

ipcMain.handle('debug:dump', async (_event, label: string, payload: unknown) => {
  if (!isDev) return null;
  try {
    const { writeFile, mkdir } = await import('node:fs/promises');
    await mkdir(debugDumpDir, { recursive: true });
    const safe = String(label).replace(/[^a-z0-9-]/gi, '_').slice(0, 40);
    const file = join(debugDumpDir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${safe}.json`);
    await writeFile(file, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`\n[debug] game snapshot written:\n  ${file}\n`);
    return file;
  } catch (error) {
    console.error('[debug] dump failed', error);
    return null;
  }
});

function runSmokeChecks(win: BrowserWindow): void {
  const fail = (why: string) => {
    console.error(`[smoke] ${why}`);
    app.exit(1);
  };
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const evalJs = <T,>(js: string) => win.webContents.executeJavaScript(js) as Promise<T>;
  const waitFor = async (js: string, label: string, tries = 40): Promise<void> => {
    for (let attempt = 0; attempt < tries; attempt++) {
      if (await evalJs<boolean>(js)) return;
      await delay(250);
    }
    fail(`timed out waiting for ${label}`);
  };

  win.webContents.on('did-fail-load', (_e, code, desc) => fail(`renderer failed to load: ${code} ${desc}`));
  win.webContents.on('render-process-gone', (_e, details) => fail(`render process gone: ${details.reason}`));
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 3 || /content security policy|troika|failed to load/i.test(message)) {
      console.log(`[renderer:${level}] ${message}`);
    }
  });

  win.webContents.on('did-finish-load', async () => {
    try {
      // Wait for a control the menu screen actually renders as text. This used
      // to look for "Boomtown", which the screen shows as a logo image — alt
      // text is not textContent, so the check could never pass once the
      // wordmark became an image.
      await waitFor(
        `[...document.querySelectorAll('button')].some((b) => b.textContent === 'Local game')`,
        'main menu',
      );

      const nodeGlobals = await evalJs<string[]>(
        `['require','process','module','global','Buffer'].filter((g) => g in globalThis)`,
      );
      if (nodeGlobals.length > 0) return fail(`Node globals leaked into the renderer: ${nodeGlobals.join(', ')}`);

      // menu -> local setup -> start a game -> let the board render
      await evalJs(`[...document.querySelectorAll('button')].find((b) => b.textContent === 'Local game')?.click()`);
      await waitFor(`(document.querySelector('#root')?.textContent ?? '').includes('New game')`, 'setup screen');
      await evalJs(`[...document.querySelectorAll('button')].find((b) => b.textContent === 'Start game')?.click()`);
      await waitFor(
        `!!document.querySelector('[aria-label="Board"]') && !!document.querySelector('[aria-label="Your tiles"]')`,
        'game board',
      );
      await delay(400); // let the first frames settle

      if (process.env['BOOMTOWN_SMOKE_SHOT']) {
        const image = await win.webContents.capturePage();
        const { writeFileSync } = await import('node:fs');
        writeFileSync(process.env['BOOMTOWN_SMOKE_SHOT'], image.toPNG());
        console.log(`[smoke] wrote ${process.env['BOOMTOWN_SMOKE_SHOT']}`);
      }

      console.log('[smoke] setup screen + board rendered, no Node globals — OK');
      app.exit(0);
    } catch (error) {
      fail(`smoke check threw: ${String(error)}`);
    }
  });
}

function createWindow(): void {
  // `screen` is only readable once the app is ready, which is why the size
  // is applied here rather than inside `windowOptions`.
  const icon = iconPath({
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    mainDir: import.meta.dirname,
  });
  const work = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    ...windowOptions(join(import.meta.dirname, '../preload/preload.cjs')),
    // gamescope is not a desktop: it decorates nothing and composites one
    // surface, so Game Mode opens fullscreen at the compositor's own size
    // rather than maximized within a work area that has no taskbar to clear.
    ...(shape.gamescope ? compositorBounds(work) : openingBounds(work)),
    // Electron logs a warning for a missing icon path; skip it rather than
    // assume a layout that a future packaging change could invalidate.
    ...(existsSync(icon) ? { icon } : {}),
    show: !smoke,
  });
  boot.reach('window-created');

  registerWindowControls(win);
  openForSession(win, shape);
  boot.watch(win);
  if (smoke) runSmokeChecks(win);

  // external links go to the OS browser; nothing opens a second in-app window
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });

  boot.reach('renderer-load-started');
  if (rendererUrl) {
    void win.loadURL(rendererUrl);
  } else {
    void win.loadFile(join(import.meta.dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  if (!soleInstance) return;
  boot.reach('app-ready');
  applyCsp();
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(menuTemplate({ platform: process.platform, dev: isDev, appName: app.name })),
  );
  createWindow();
  if (!smoke) void checkForUpdates();
});

// Closing the window closes the app, macOS included. The platform convention
// there is to stay alive in the dock, but that is for apps you return to —
// documents, mail, a browser. A game holds its table in the renderer, so a
// window-less Boomtown has nothing left to return to: it would sit in the dock
// as an empty process, and reopening it would deal a new game anyway. Quitting
// is what closing the window already meant.
app.on('window-all-closed', () => app.quit());

// refuse any navigation away from the app's own content
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    if (!rendererUrl || !url.startsWith(rendererUrl)) event.preventDefault();
  });
});
