import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, session, shell } from 'electron';
import { buildCsp } from './csp.js';
import { windowOptions } from './window.js';

/** electron-vite sets this to the dev-server URL; absent in a packaged build. */
const rendererUrl = process.env['ELECTRON_RENDERER_URL'];
const isDev = Boolean(rendererUrl);

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

function createWindow(): void {
  const win = new BrowserWindow(windowOptions(join(import.meta.dirname, '../preload/preload.cjs')));

  registerWindowControls(win);
  win.once('ready-to-show', () => win.show());

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
