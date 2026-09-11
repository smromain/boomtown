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
}

export const DEFAULT_SETTINGS: Settings = {
  visibility: 'open',
  botDifficulty: 5,
  edition: 'boomtown',
  seatCount: 3,
  partykitHost: '',
  muted: false,
  playerName: '',
};

const KEY = 'boomtown.settings';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
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
