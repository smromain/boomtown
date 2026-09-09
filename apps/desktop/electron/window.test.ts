import { describe, expect, it } from 'vitest';
import {
  MIN_HEIGHT,
  MIN_WIDTH,
  openMaximized,
  openingBounds,
  windowOptions,
  type Maximizable,
} from './window.js';

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

  it('floors the window at a size the layout still works in', () => {
    const options = windowOptions('/x');
    expect(options.minWidth).toBe(MIN_WIDTH);
    expect(options.minHeight).toBe(MIN_HEIGHT);
  });
});

describe('openMaximized', () => {
  function fakeWindow() {
    const calls: string[] = [];
    let readyToShow: (() => void) | null = null;
    const win: Maximizable = {
      maximize: () => calls.push('maximize'),
      show: () => calls.push('show'),
      once: (_event, listener) => {
        readyToShow = listener;
        return win;
      },
    };
    return { win, calls, paint: () => readyToShow?.() };
  }

  it('maximizes at once, before the window is ever shown', () => {
    // Outside smoke mode the window is constructed with `show: true`, so
    // maximizing on ready-to-show instead would put it on screen at its
    // restore size and pop to full size a frame later.
    const { win, calls, paint } = fakeWindow();
    openMaximized(win);
    expect(calls).toEqual(['maximize']);
    paint();
    expect(calls).toEqual(['maximize', 'show']);
  });
});

describe('openingBounds', () => {
  it('fills the display work area, so the window clears the taskbar and dock', () => {
    expect(openingBounds({ width: 2560, height: 1400 })).toEqual({ width: 2560, height: 1400 });
  });

  it('never opens below the minimum usable size on a small display', () => {
    expect(openingBounds({ width: 800, height: 600 })).toEqual({
      width: MIN_WIDTH,
      height: MIN_HEIGHT,
    });
  });

  it('rounds a fractional work area to whole pixels', () => {
    expect(openingBounds({ width: 1512.5, height: 944.4 })).toEqual({ width: 1513, height: 944 });
  });
});
