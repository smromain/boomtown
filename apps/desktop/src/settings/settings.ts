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
  /**
   * Sound effect volume, 0–1 (R9). The header's speaker button opens a slider
   * onto this; 0 is silence, which is what a mute amounts to.
   */
  readonly effectsVolume: number;
  /**
   * Music volume, 0–1, set independently of the effects. It defaults lower
   * because a soundtrack sits under the table talk while the effects mark the
   * game's moments — but that is a starting balance, not a fixed ratio, and the
   * two sliders part company the moment anyone moves one.
   */
  readonly musicVolume: number;
  /** Background music. Music ships on by default; the header's music button
   *  persists this. Separate from `muted` so a table can keep the effects that
   *  mark the game's moments while turning the soundtrack off, or the reverse. */
  readonly musicMuted: boolean;
  /** The id of the track the back/forward buttons are parked on. An id rather
   *  than a position, so reordering the tracks can't silently move a table's
   *  choice to a different one. It survives leaving a game. */
  readonly musicTrack: string;
  /**
   * The name this player joins online rooms under. Blank until they play
   * online once, at which point the lobby seeds it with a generated name and
   * remembers whatever they settle on — so a returning player keeps their
   * identity across rooms and reconnects, the way `partykitHost` does.
   */
  readonly playerName: string;
  /**
   * Draw a texture per industry over the board's cells, the corporation caps
   * and the merger discs, so a chain is told by shape as well as colour (#19).
   * Off by default: most players are served by the glyphs and the re-spaced
   * palette, and a texture on every tile is noise to them. Per machine, like
   * every setting here, so two players at one online table can differ.
   */
  readonly industryPatterns: boolean;
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
const SETTINGS_VERSION = 4;

export const DEFAULT_SETTINGS: Settings = {
  visibility: 'open',
  botDifficulty: 5,
  edition: 'boomtown',
  seatCount: 3,
  partykitHost: '',
  effectsVolume: 1,
  musicVolume: 0.5,
  musicMuted: false,
  musicTrack: 'pleasant-creek',
  playerName: '',
  industryPatterns: false,
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
 *
 * **v2 → v3: `muted` becomes a volume, and `musicTrack` becomes an id.** The
 * speaker button is a volume slider now, so the old boolean carries over as the
 * only volume it could mean: silence, or everything. And `musicTrack` used to
 * be a position in the track list, which stopped meaning anything the moment
 * the list was reordered — a stored number is dropped rather than pointed at
 * whichever track happens to sit there now.
 *
 * **v3 → v4: one volume becomes two.** Effects and music are set separately
 * now. A stored master carries over as the level it was actually producing on
 * each side — the effects at face value, the music at the half share it used to
 * take — so nothing changes audibly for anyone who had set a level.
 */
function migrate(
  stored: Partial<Settings> & { muted?: boolean; volume?: number },
): Partial<Settings> {
  let next: Partial<Settings> & { muted?: boolean; volume?: number } = stored;
  if ((next.version ?? 1) < 2) {
    const { edition: _staleDefault, ...rest } = next;
    next = rest;
  }
  if ((next.version ?? 1) < 3) {
    const { muted, musicTrack, ...rest } = next;
    next = {
      ...rest,
      ...(muted !== undefined ? { volume: muted ? 0 : 1 } : {}),
      ...(typeof musicTrack === 'string' ? { musicTrack } : {}),
    };
  }
  if ((next.version ?? 1) < 4) {
    const { volume, ...rest } = next;
    next =
      typeof volume === 'number'
        ? { ...rest, effectsVolume: volume, musicVolume: volume * 0.5 }
        : rest;
  }
  return next;
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

/**
 * Fired on `window` after every save. Most settings are read once, when a
 * table is set up; this is for the few that change what is already on screen
 * (see `useSetting`), which have to hear about a save to redraw.
 */
export const SETTINGS_CHANGED = 'boomtown:settings-changed';

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // a session without localStorage just keeps defaults
  }
  window.dispatchEvent(new Event(SETTINGS_CHANGED));
}
