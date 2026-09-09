import { Howl } from 'howler';
import { loadSettings, saveSettings } from '../settings/settings.js';

import tilePlaceUrl from '../assets/sound/tile-place.wav';
import foundingUrl from '../assets/sound/founding.wav';
import buyUrl from '../assets/sound/buy.wav';
import mergerUrl from '../assets/sound/merger.wav';
import endgameUrl from '../assets/sound/endgame.wav';
import victoryUrl from '../assets/sound/victory.wav';

export type SoundId = 'tile-place' | 'founding' | 'buy' | 'merger' | 'endgame' | 'victory';

const SOURCES: Record<SoundId, string> = {
  'tile-place': tilePlaceUrl,
  founding: foundingUrl,
  buy: buyUrl,
  merger: mergerUrl,
  endgame: endgameUrl,
  victory: victoryUrl,
};

/**
 * The sound effect set (U5, R9): one placeholder blip per beat plus tile
 * placement. Howls are created lazily (not at module load) so a test
 * environment that never plays a sound never touches the audio stack.
 */
class SoundManager {
  private howls = new Map<SoundId, Howl>();

  private howlFor(id: SoundId): Howl {
    let howl = this.howls.get(id);
    if (!howl) {
      howl = new Howl({ src: [SOURCES[id]] });
      this.howls.set(id, howl);
    }
    return howl;
  }

  isMuted(): boolean {
    return loadSettings().muted;
  }

  setMuted(muted: boolean): void {
    saveSettings({ ...loadSettings(), muted });
  }

  /** No-op when muted — every call site can fire-and-forget. */
  play(id: SoundId): void {
    if (this.isMuted()) return;
    this.howlFor(id).play();
  }
}

export const soundManager = new SoundManager();
