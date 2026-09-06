import { describe, expect, it } from 'vitest';
import { windowOptions } from './window.js';

describe('windowOptions', () => {
  it('isolates the renderer: context isolation on, node integration off, sandbox on (KTD9)', () => {
    const { webPreferences } = windowOptions('/tmp/preload.cjs');
    expect(webPreferences?.contextIsolation).toBe(true);
    expect(webPreferences?.nodeIntegration).toBe(false);
    expect(webPreferences?.sandbox).toBe(true);
    expect(webPreferences?.webviewTag).toBe(false);
  });

  it('wires the given preload path', () => {
    expect(windowOptions('/tmp/preload.cjs').webPreferences?.preload).toBe('/tmp/preload.cjs');
  });

  it('starts hidden so the first paint is not a white flash', () => {
    expect(windowOptions('/x').show).toBe(false);
  });
});
