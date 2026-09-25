import { useSyncExternalStore } from 'react';
import { loadSettings, saveSettings, type Settings } from '../settings/settings.js';

export type BoardStyle = Settings['boardStyle'];
export type Lighting = Settings['lighting'];

/** Why this machine is drawing Board View although Skyline was asked for. */
export type SkylineTrouble = 'no-webgl' | 'software' | 'slow' | 'lost' | 'failed';

export interface BoardPrefs {
  /** What the player picked. */
  readonly chosen: BoardStyle;
  /** What is drawn: `chosen`, unless Skyline could not run here this session. */
  readonly style: BoardStyle;
  readonly lighting: Lighting;
  /** Set once Skyline has fallen back this session; it is not retried until the app restarts. */
  readonly trouble: SkylineTrouble | null;
  /**
   * Skip the software-renderer and slow-frame checks. Only the browser build's
   * `?forceSkyline=1` sets it: headless Chromium draws WebGL with SwiftShader,
   * which is exactly the software renderer those checks exist to refuse, and
   * the run-app driver still has to be able to exercise Skyline.
   */
  readonly forced: boolean;
}

/**
 * The URL can pick the board for one session without touching the stored
 * setting: `?board=skyline` or `?board=board-view`, plus `forceSkyline=1`.
 * That is for scripted runs; a player never sees a URL.
 */
function fromUrl(): { chosen: BoardStyle | null; forced: boolean } {
  try {
    const params = new URLSearchParams(window.location.search);
    const board = params.get('board');
    return {
      chosen: board === 'skyline' || board === 'board-view' ? board : null,
      forced: params.get('forceSkyline') === '1',
    };
  } catch {
    return { chosen: null, forced: false };
  }
}

const url = fromUrl();
let override: BoardStyle | null = url.chosen;
let trouble: SkylineTrouble | null = null;

function read(): BoardPrefs {
  const settings = loadSettings();
  const chosen = override ?? (settings.boardStyle === 'skyline' ? 'skyline' : 'board-view');
  return {
    chosen,
    style: chosen === 'skyline' && !trouble ? 'skyline' : 'board-view',
    lighting: lightingOf(settings),
    trouble,
    forced: url.forced,
  };
}

/** The app's day/night setting, which Skyline follows rather than keeping one of its own. */
function lightingOf(settings: Settings): Lighting {
  return settings.lighting === 'night' ? 'night' : 'day';
}

let current: BoardPrefs = read();
const listeners = new Set<() => void>();

function publish(): void {
  current = read();
  for (const listener of listeners) listener();
}

export function getBoardPrefs(): BoardPrefs {
  return current;
}

/** Pick the board, and remember it. The header's toggle and the settings dialog both land here. */
export function setBoardStyle(style: BoardStyle): void {
  override = null;
  saveSettings({ ...loadSettings(), boardStyle: style });
  publish();
}

/** Day or night for the whole app, from the one-click toggle on the Skyline board. */
export function setLighting(lighting: Lighting): void {
  saveSettings({ ...loadSettings(), lighting });
  publish();
}

/** Re-read after something else wrote the settings (the dialog's Save). */
export function refreshBoardPrefs(): void {
  publish();
}

/**
 * Skyline could not run here. The board drops to Board View on the spot — the
 * grid under the canvas never went away, so nothing is lost but the buildings —
 * and the stored choice stays Skyline: it is a preference, not a verdict.
 */
export function reportSkylineTrouble(reason: SkylineTrouble): void {
  if (trouble) return;
  trouble = reason;
  publish();
}

export function useBoardPrefs(): BoardPrefs {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getBoardPrefs,
    getBoardPrefs,
  );
}

/** Tests only: forget the session's trouble and override. */
export function resetBoardPrefsForTests(): void {
  override = null;
  trouble = null;
  publish();
}
