import { describe, expect, it } from 'vitest';
import {
  MIN_HEIGHT,
  MIN_WIDTH,
  compositorBounds,
  openForSession,
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

describe('compositorBounds', () => {
  it('fills the compositor output exactly and asks for fullscreen up front', () => {
    // The Steam Deck's own Game Mode output.
    expect(compositorBounds({ width: 1280, height: 800 })).toEqual({
      width: 1280,
      height: 800,
      minWidth: 1024,
      minHeight: 700,
      fullscreen: true,
    });
  });

  it('never floors the window above the screen it has to fit on', () => {
    // `openingBounds` would hand back 1024x700 here and crop the board's edges
    // off an output nothing can scroll or resize.
    const small = compositorBounds({ width: 800, height: 480 });
    expect(small.width).toBe(800);
    expect(small.height).toBe(480);
    expect(small.minWidth).toBe(800);
    expect(small.minHeight).toBe(480);
  });
});

describe('openForSession', () => {
  function fakeWindow() {
    const calls: string[] = [];
    let readyToShow: (() => void) | null = null;
    const win = {
      maximize: () => calls.push('maximize'),
      setFullScreen: (flag: boolean) => calls.push(`setFullScreen(${flag})`),
      show: () => calls.push('show'),
      once: (_event: 'ready-to-show', listener: () => void) => {
        readyToShow = listener;
        return win;
      },
    };
    return { win, calls, ready: () => readyToShow?.() };
  }

  it('goes true fullscreen under gamescope, never merely maximized', () => {
    // A maximized window in Game Mode has no title bar to close it with and is
    // not reliably the surface gamescope chooses to show.
    const { win, calls, ready } = fakeWindow();
    openForSession(win, { gamescope: true });
    ready();
    expect(calls).toEqual(['setFullScreen(true)', 'show']);
    expect(calls).not.toContain('maximize');
  });

  it('opens maximized on a desktop, where the window chrome is worth keeping', () => {
    const { win, calls, ready } = fakeWindow();
    openForSession(win, { gamescope: false });
    ready();
    expect(calls).toEqual(['maximize', 'show']);
  });
});
