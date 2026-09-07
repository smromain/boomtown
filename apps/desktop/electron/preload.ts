import { contextBridge, ipcRenderer } from 'electron';

/**
 * The entire surface the renderer gets. `contextIsolation` keeps this behind a
 * frozen bridge; the renderer cannot reach `ipcRenderer`, `require`, or any Node
 * global directly (KTD9). Settings and update are stubbed until U19.
 */
const api = {
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
  settings: {
    get: (): Promise<Record<string, unknown>> => ipcRenderer.invoke('settings:get'),
    set: (patch: Record<string, unknown>): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('settings:set', patch),
  },
  update: {
    check: (): Promise<{ available: boolean }> => ipcRenderer.invoke('update:check'),
  },
  debug: {
    /** Dev-only: write a game-state snapshot to the app's log directory for
     *  post-hoc debugging. A no-op in a packaged build. Returns the file path. */
    dump: (label: string, payload: unknown): Promise<string | null> =>
      ipcRenderer.invoke('debug:dump', label, payload),
  },
} as const;

contextBridge.exposeInMainWorld('boomtown', api);

export type BoomtownBridge = typeof api;
