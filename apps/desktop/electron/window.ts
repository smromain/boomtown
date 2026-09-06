import type { BrowserWindowConstructorOptions } from 'electron';

/**
 * The renderer's security posture (KTD9). Exported as a pure factory so U9's
 * verification — context isolation on, node integration off, sandbox on — is a
 * unit test rather than a manual check.
 */
export function windowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  return {
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
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
