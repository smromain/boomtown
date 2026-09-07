import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, session, shell } from 'electron';
import { buildCsp } from './csp.js';
import { windowOptions } from './window.js';

/** electron-vite sets this to the dev-server URL; absent in a packaged build. */
const rendererUrl = process.env['ELECTRON_RENDERER_URL'];
const isDev = Boolean(rendererUrl);

/** CI/headless boot check: load the window, confirm the renderer mounts, then exit. */
const smoke = process.env['BOOMTOWN_SMOKE'] === '1';

function applyCsp(): void {
  const csp = buildCsp({ dev: isDev });
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

// Placeholder handlers — U19 replaces these with a real settings store and updater.
ipcMain.handle('settings:get', () => ({}));
ipcMain.handle('settings:set', (_event, patch: Record<string, unknown>) => patch);
ipcMain.handle('update:check', () => ({ available: false }));

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
      await waitFor(`(document.querySelector('#root')?.textContent ?? '').includes('New game')`, 'setup screen');

      const nodeGlobals = await evalJs<string[]>(
        `['require','process','module','global','Buffer'].filter((g) => g in globalThis)`,
      );
      if (nodeGlobals.length > 0) return fail(`Node globals leaked into the renderer: ${nodeGlobals.join(', ')}`);

      // start a game and let the board render
      await evalJs(`[...document.querySelectorAll('button')].find((b) => b.textContent === 'Start game')?.click()`);
      await waitFor(`!!document.querySelector('canvas') && !!document.querySelector('[aria-label="Market"]')`, 'game board');
      await delay(1500); // let troika glyphs + the first frames settle

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
  const win = new BrowserWindow({
    ...windowOptions(join(import.meta.dirname, '../preload/preload.cjs')),
    show: !smoke,
  });

  registerWindowControls(win);
  win.once('ready-to-show', () => win.show());
  if (smoke) runSmokeChecks(win);

  // external links go to the OS browser; nothing opens a second in-app window
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (rendererUrl) {
    void win.loadURL(rendererUrl);
  } else {
    void win.loadFile(join(import.meta.dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  applyCsp();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// refuse any navigation away from the app's own content
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    if (!rendererUrl || !url.startsWith(rendererUrl)) event.preventDefault();
  });
});
