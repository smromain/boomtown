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

  /** The master volume, 0–1. Music reads the same number — see `MUSIC_MIX`. */
  volume(): number {
    const stored = loadSettings().volume;
    return Number.isFinite(stored) ? Math.min(1, Math.max(0, stored)) : 1;
  }

  setVolume(volume: number): void {
    saveSettings({ ...loadSettings(), volume: Math.min(1, Math.max(0, volume)) });
  }

  isMuted(): boolean {
    return this.volume() === 0;
  }

  /** No-op at zero volume — every call site can fire-and-forget. Effects are
   *  short, so the level is set as each one fires rather than pushed onto live
   *  playback the way music needs. */
  play(id: SoundId): void {
    const volume = this.volume();
    if (volume === 0) return;
    const howl = this.howlFor(id);
    howl.volume(volume);
    howl.play();
  }
}

export const soundManager = new SoundManager();
