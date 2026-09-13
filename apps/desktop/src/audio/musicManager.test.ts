import { afterEach, describe, expect, it, vi } from 'vitest';
import { Howl } from 'howler';
import { musicManager, TRACKS } from './musicManager.js';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../settings/settings.js';

interface FakeHowl {
  play: () => void;
  stop: () => void;
  unload: () => void;
  playing: () => boolean;
}

vi.mock('howler', () => ({
  Howl: vi.fn().mockImplementation(() => {
    let playing = false;
    return {
      play: vi.fn(() => {
        playing = true;
      }),
      stop: vi.fn(() => {
        playing = false;
      }),
      unload: vi.fn(() => {
        playing = false;
      }),
      playing: () => playing,
    };
  }),
}));

const instances = () => vi.mocked(Howl).mock.results.map((r) => r.value as FakeHowl);

afterEach(() => {
  // The manager is a module singleton, so its Howl cache would otherwise leak
  // from one test into the next — exactly what `release()` is for.
  musicManager.release();
  localStorage.clear();
  vi.clearAllMocks();
});

describe('musicManager', () => {
  it('plays the first track at half volume, looping', () => {
    musicManager.play();
    expect(Howl).toHaveBeenCalledOnce();
    expect(vi.mocked(Howl).mock.calls[0]![0]).toMatchObject({ loop: true, volume: 0.5 });
    expect(instances()[0]!.play).toHaveBeenCalledOnce();
  });

  it('does not restart a track that is already playing', () => {
    musicManager.play();
    musicManager.play();
    expect(instances()[0]!.play).toHaveBeenCalledOnce();
  });

  it('stays silent while the music is off', () => {
    saveSettings({ ...DEFAULT_SETTINGS, musicMuted: true });
    musicManager.play();
    expect(Howl).not.toHaveBeenCalled();
  });

  it('ignores the effects mute — the two switches do not reach across', () => {
    saveSettings({ ...DEFAULT_SETTINGS, muted: true });
    musicManager.play();
    expect(instances()[0]!.play).toHaveBeenCalledOnce();
  });

  it('setMuted stops the music at once, and starts it again on the way back', () => {
    musicManager.play();
    const first = instances()[0]!;

    musicManager.setMuted(true);
    expect(first.stop).toHaveBeenCalled();
    expect(loadSettings().musicMuted).toBe(true);

    musicManager.setMuted(false);
    expect(first.play).toHaveBeenCalledTimes(2);
    expect(loadSettings().musicMuted).toBe(false);
  });

  it('next() moves along the cycle, wrapping at the end', () => {
    expect(musicManager.current()).toBe(TRACKS[0]);
    for (let i = 1; i < TRACKS.length; i++) {
      expect(musicManager.next()).toBe(TRACKS[i]);
    }
    expect(musicManager.next()).toBe(TRACKS[0]);
  });

  it('previous() walks back, wrapping past the first to the last', () => {
    expect(musicManager.previous()).toBe(TRACKS.at(-1));
    expect(musicManager.previous()).toBe(TRACKS.at(-2));
  });

  it('a skip forward and back leaves the same track playing', () => {
    musicManager.next();
    expect(musicManager.previous()).toBe(TRACKS[0]);
    expect(instances().at(-1)!.play).toHaveBeenCalled();
  });

  it('remembers the track across sittings, and plays it rather than the first', () => {
    saveSettings({ ...DEFAULT_SETTINGS, musicTrack: 2 });
    expect(musicManager.current()).toBe(TRACKS[2]);
    musicManager.play();
    expect(vi.mocked(Howl).mock.calls[0]![0]).toMatchObject({ src: [TRACKS[2]!.src] });
  });

  it('folds a stored index past the end back to the first track', () => {
    saveSettings({ ...DEFAULT_SETTINGS, musicTrack: TRACKS.length + 1 });
    expect(musicManager.current()).toBe(TRACKS[1]);
  });

  it('skipping while the music is off still moves the dial, so switching it back on resumes there', () => {
    saveSettings({ ...DEFAULT_SETTINGS, musicMuted: true });
    musicManager.next();
    expect(Howl).not.toHaveBeenCalled();
    expect(loadSettings().musicTrack).toBe(1);
  });

  it('reuses one Howl per track across stops and starts', () => {
    musicManager.play();
    musicManager.stop();
    musicManager.play();
    expect(Howl).toHaveBeenCalledOnce();
  });

  it('release() lets go of the audio, so the next game builds it fresh', () => {
    musicManager.play();
    const first = instances()[0]!;
    musicManager.release();
    expect(first.unload).toHaveBeenCalledOnce();
    musicManager.play();
    expect(Howl).toHaveBeenCalledTimes(2);
  });
});
