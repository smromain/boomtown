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
}

/** The order the music button cycles in. */
export const TRACKS: readonly Track[] = [
  { id: 'green-salon', title: 'Green Salon', src: greenSalonUrl },
  { id: 'azure', title: 'Azure', src: azureUrl },
  { id: '8bit-bossa', title: '8-Bit Bossa', src: bossaUrl },
  { id: 'pleasant-creek', title: 'Pleasant Creek Loop', src: pleasantCreekUrl },
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
 * The two share a single `muted` setting on purpose: the header's speaker
 * button is the one place a table silences the app, and a player reaching for
 * it while music plays means *stop the noise*, not "stop the blips and leave
 * the soundtrack running". So mute stops music too, and unmuting picks it back
 * up where the cycle stands.
 *
 * The music button never stops the music — it moves to the next track. Which
 * track is playing is remembered across games, so the table's choice is not
 * re-made for them every time they sit down.
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

  /**
   * Start the current track, unless the app is muted. Safe to call as often as
   * you like — a track already playing is left alone rather than restarted.
   */
  play(): void {
    if (loadSettings().muted) return;
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

  /** Move to the next track and play it; returns the track now playing so the
   *  caller can say its name. Cycling while muted still moves the cycle on, so
   *  unmuting starts where the player last left it. */
  next(): Track {
    this.stop();
    const index = TRACKS.indexOf(this.current());
    const settings = loadSettings();
    saveSettings({ ...settings, musicTrack: (index + 1) % TRACKS.length });
    this.play();
    return this.current();
  }

  /** Follow the app-wide mute after it changes: silence, or pick back up. */
  syncMute(): void {
    if (loadSettings().muted) this.stop();
    else this.play();
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
