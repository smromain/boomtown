import type { RulesetId, Visibility } from '@boomtown/engine';

/**
 * Renderer-side preferences, persisted in `localStorage`. These seed the local
 * and online setup screens and the online host URL. Nothing here is
 * security-sensitive; the main process keeps its own store for window bounds
 * and the update channel.
 */
export interface Settings {
  /** Default table cash/holdings visibility. */
  readonly visibility: Visibility;
  /** Default bot difficulty (1–10). */
  readonly botDifficulty: number;
  /** Default edition preset. */
  readonly edition: RulesetId;
  /** Default seat count for a new game. */
  readonly seatCount: number;
  /** Override for the PartyKit host; blank = use the build-time default. */
  readonly partykitHost: string;
  /** Sound effects (R9). Sound ships on by default; the header mute control persists this. */
  readonly muted: boolean;
  /**
   * The name this player joins online rooms under. Blank until they play
   * online once, at which point the lobby seeds it with a generated name and
   * remembers whatever they settle on — so a returning player keeps their
   * identity across rooms and reconnects, the way `partykitHost` does.
   */
  readonly playerName: string;
  /**
   * Schema version of the stored blob. Absent on anything written before
   * migrations existed; see `migrate`.
   */
  readonly version: number;
}

/**
 * Bump this when a shipped default changes and the stored value should give
 * way to it — see `migrate` for what each bump does.
 */
const SETTINGS_VERSION = 2;

export const DEFAULT_SETTINGS: Settings = {
  visibility: 'open',
  botDifficulty: 5,
  edition: 'boomtown',
  seatCount: 3,
  partykitHost: '',
  muted: false,
  playerName: '',
  version: SETTINGS_VERSION,
};

/**
 * Bring a stored blob forward to the current schema.
 *
 * **v1 → v2: drop a stored `edition`.** Changing `DEFAULT_SETTINGS.edition` to
 * Boomtown reached nobody who had ever played, because `loadSettings` merges
 * the stored blob over the defaults and every install had an edition frozen in
 * it. Not only from the settings dialog either: `soundManager.setMuted` writes
 * the *whole* object, so muting the sound once persisted the edition too.
 *
 * Dropping it is honest rather than presumptuous. v1 predates the Boomtown
 * preset entirely, so a stored `classic` was never a choice between the two —
 * it is the old default, saved by a side effect. Anyone who picks an edition
 * from here on writes v2 and keeps it.
 */
function migrate(stored: Partial<Settings>): Partial<Settings> {
  if ((stored.version ?? 1) >= 2) return stored;
  const { edition: _staleDefault, ...rest } = stored;
  return rest;
}

const KEY = 'boomtown.settings';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...migrate(parsed) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // a session without localStorage just keeps defaults
  }
}
