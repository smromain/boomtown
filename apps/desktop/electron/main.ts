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

  win.webContents.on('did-fail-load', (_e, code, desc) => fail(`renderer failed to load: ${code} ${desc}`));
  win.webContents.on('render-process-gone', (_e, details) => fail(`render process gone: ${details.reason}`));
  win.webContents.on('did-finish-load', async () => {
    try {
      // In dev the app is served as ES modules that execute after did-finish-load,
      // so poll for React to mount.
      let rootText = '';
      for (let attempt = 0; attempt < 40; attempt++) {
        rootText = await win.webContents.executeJavaScript(
          `document.querySelector('#root')?.textContent ?? ''`,
        );
        if (rootText.includes('New game')) break;
        await delay(250);
      }
      const hasNodeGlobals = await win.webContents.executeJavaScript(
        `['require','process','module','global','Buffer'].filter((g) => g in globalThis)`,
      );
      if (!rootText.includes('New game')) {
        return fail(`renderer did not mount the setup screen (root: ${JSON.stringify(rootText)})`);
      }
      if (Array.isArray(hasNodeGlobals) && hasNodeGlobals.length > 0) {
        return fail(`Node globals leaked into the renderer: ${hasNodeGlobals.join(', ')}`);
      }
      console.log('[smoke] renderer mounted the setup screen, no Node globals — OK');
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
