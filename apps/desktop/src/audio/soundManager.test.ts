import { afterEach, describe, expect, it, vi } from 'vitest';
import { Howl } from 'howler';
import { soundManager } from './soundManager.js';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../settings/settings.js';

vi.mock('howler', () => {
  const play = vi.fn();
  const volume = vi.fn();
  return { Howl: vi.fn().mockImplementation(() => ({ play, volume })) };
});

afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('soundManager', () => {
  it('play() triggers playback at the effect volume', () => {
    saveSettings({ ...DEFAULT_SETTINGS, effectsVolume: 0.6 });
    soundManager.play('tile-place');
    const instance = vi.mocked(Howl).mock.results[0]!.value as { play: () => void; volume: (v: number) => void };
    expect(instance.volume).toHaveBeenCalledWith(0.6);
    expect(instance.play).toHaveBeenCalledOnce();
  });

  it('play() is a no-op at zero — the effects slider bottoming out is the mute', () => {
    saveSettings({ ...DEFAULT_SETTINGS, effectsVolume: 0 });
    expect(soundManager.isMuted()).toBe(true);
    soundManager.play('tile-place');
    expect(vi.mocked(Howl)).not.toHaveBeenCalled();
  });

  it('setVolume persists through the settings store, clamped to 0–1', () => {
    soundManager.setVolume(0.25);
    expect(loadSettings().effectsVolume).toBe(0.25);
    soundManager.setVolume(4);
    expect(loadSettings().effectsVolume).toBe(1);
    soundManager.setVolume(-1);
    expect(loadSettings().effectsVolume).toBe(0);
  });

  it('a stored volume that is not a number falls back to full rather than silence', () => {
    localStorage.setItem('boomtown.settings', JSON.stringify({ version: 4, effectsVolume: 'loud' }));
    expect(soundManager.volume()).toBe(1);
  });

  it('reuses one Howl instance per sound id across calls', () => {
    saveSettings({ ...DEFAULT_SETTINGS, effectsVolume: 1 });
    soundManager.play('victory');
    soundManager.play('victory');
    expect(vi.mocked(Howl)).toHaveBeenCalledTimes(1);
  });
});
