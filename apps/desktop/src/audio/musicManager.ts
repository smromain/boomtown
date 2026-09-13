import { Howl } from 'howler';
import { loadSettings, saveSettings } from '../settings/settings.js';

import greenSalonUrl from '../assets/music/green-salon.ogg';
import azureUrl from '../assets/music/azure.mp3';
import bossaUrl from '../assets/music/8bit-bossa.mp3';
import pleasantCreekUrl from '../assets/music/pleasant-creek-loop.wav';

export interface Track {
  readonly id: string;
  /** What the header calls it. */
  readonly title: string;
  readonly src: string;
  /** Who wrote it, as the settings dialog credits them. It lives here rather
   *  than in the dialog so a track can never be added without its credit. */
  readonly credit: string;
}

/** Where every track came from, named once in the credits. */
export const MUSIC_SOURCE = 'All tracks sourced from OpenGameArt.org';

/** The order the music button cycles in. */
export const TRACKS: readonly Track[] = [
  { id: 'green-salon', title: 'Green Salon', src: greenSalonUrl, credit: 'Composed/Authored by Yubatake' },
  { id: 'azure', title: 'Azure', src: azureUrl, credit: 'Music by Kistol' },
  { id: '8bit-bossa', title: '8-Bit Bossa', src: bossaUrl, credit: 'Composed/Authored by Joth' },
  {
    id: 'pleasant-creek',
    title: 'Pleasant Creek Loop',
    src: pleasantCreekUrl,
    credit: 'Composed/Authored by Matthew Pablo',
  },
];

/**
 * Under the table talk, not over it. Half volume is the whole reason music can
 * be on by default: at full it competes with the beats' own sounds, which carry
 * the game's moments and have to win.
 */
const VOLUME = 0.5;

/**
 * The background music (one track at a time, looping) as a counterpart to
 * `soundManager`.
 *
 * Music has its own switch (`musicMuted`) rather than riding on the effects'
 * one. They serve different appetites: the effects mark the game's moments and
 * a table that wants them may still not want a soundtrack under their
 * conversation — or may want the room scored while the blips get out of the
 * way. Either combination is reachable, and neither button reaches across.
 *
 * Which track is parked on is remembered across games, so the table's choice is
 * not re-made for them every time they sit down.
 */
class MusicManager {
  private howls = new Map<string, Howl>();
  private unlockArmed = false;

  get tracks(): readonly Track[] {
    return TRACKS;
  }

  /** The track the cycle is on. A stored index past the end folds back to the
   *  first, so removing a track can't leave the player pointing at nothing. */
  current(): Track {
    const stored = loadSettings().musicTrack;
    const index = Number.isInteger(stored) ? ((stored % TRACKS.length) + TRACKS.length) % TRACKS.length : 0;
    return TRACKS[index]!;
  }

  private howlFor(track: Track): Howl {
    let howl = this.howls.get(track.id);
    if (!howl) {
      // `html5: true` streams rather than decoding the whole file into memory
      // first — these are minutes-long tracks, not blips, and one of them is a
      // 17MB wav.
      howl = new Howl({ src: [track.src], loop: true, volume: VOLUME, html5: true });
      this.howls.set(track.id, howl);
    }
    return howl;
  }

  isMuted(): boolean {
    return loadSettings().musicMuted;
  }

  /** Turn the music off or back on, and act on it at once — the button that
   *  calls this is the music's on/off, so it has to be audible immediately. */
  setMuted(muted: boolean): void {
    saveSettings({ ...loadSettings(), musicMuted: muted });
    if (muted) this.stop();
    else this.play();
  }

  /**
   * Start the current track, unless the music is off. Safe to call as often as
   * you like — a track already playing is left alone rather than restarted.
   */
  play(): void {
    if (this.isMuted()) return;
    const howl = this.howlFor(this.current());
    if (!howl.playing()) howl.play();
  }

  stop(): void {
    for (const howl of this.howls.values()) howl.stop();
  }

  /**
   * Stop and let go of the audio entirely. Called when the game screen is left:
   * a streamed track holds a buffer for as long as it exists, and one of these
   * is a 17MB wav, so keeping four of them alive through a menu nobody is
   * listening to is pure cost. The next game builds what it needs again.
   */
  release(): void {
    for (const howl of this.howls.values()) {
      howl.stop();
      howl.unload();
    }
    this.howls.clear();
  }

  /** The next track along, playing; returns it so the caller can say its name. */
  next(): Track {
    return this.step(1);
  }

  /** The previous track, playing. The pair wrap in both directions: four tracks
   *  is short enough that going back from the first should land on the last
   *  rather than do nothing. */
  previous(): Track {
    return this.step(-1);
  }

  /** Moving the cycle while the music is off still moves it, so switching the
   *  music back on starts from wherever the table left the dial. */
  private step(delta: number): Track {
    this.stop();
    const index = TRACKS.indexOf(this.current());
    const next = (index + delta + TRACKS.length) % TRACKS.length;
    saveSettings({ ...loadSettings(), musicTrack: next });
    this.play();
    return this.current();
  }

  /**
   * Begin playing, now or at the first opportunity.
   *
   * Autoplay is blocked until the page has been interacted with, and a game can
   * be reached by keyboard alone, so a single `play()` at mount can silently do
   * nothing. Retrying once on the first pointer or key event costs nothing and
   * covers the case; Howler's own unlock handles the rest.
   */
  begin(): void {
    this.play();
    if (this.unlockArmed || typeof window === 'undefined') return;
    this.unlockArmed = true;
    const retry = () => {
      this.unlockArmed = false;
      this.play();
    };
    window.addEventListener('pointerdown', retry, { once: true });
    window.addEventListener('keydown', retry, { once: true });
  }
}

export const musicManager = new MusicManager();
