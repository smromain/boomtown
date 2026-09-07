import { beforeEach, describe, expect, it, vi } from 'vitest';

const exposeInMainWorld = vi.fn();
const send = vi.fn();
const invoke = vi.fn().mockResolvedValue({});

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { send, invoke },
}));

describe('preload bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('exposes exactly one namespaced API on window', async () => {
    await import('./preload.js');
    expect(exposeInMainWorld).toHaveBeenCalledTimes(1);
    const [key, api] = exposeInMainWorld.mock.calls[0]!;
    expect(key).toBe('boomtown');
    expect(Object.keys(api as object).sort()).toEqual(['debug', 'settings', 'update', 'window']);
  });

  it('window controls send fire-and-forget IPC, settings/update use invoke', async () => {
    await import('./preload.js');
    const api = exposeInMainWorld.mock.calls[0]![1] as {
      window: { minimize: () => void };
      settings: { get: () => Promise<unknown> };
    };

    api.window.minimize();
    expect(send).toHaveBeenCalledWith('window:minimize');

    await api.settings.get();
    expect(invoke).toHaveBeenCalledWith('settings:get');
  });
});
