import { afterEach, describe, expect, it, vi } from 'vitest';
import { Howl } from 'howler';
import { soundManager } from './soundManager.js';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../settings/settings.js';

vi.mock('howler', () => {
  const play = vi.fn();
  return { Howl: vi.fn().mockImplementation(() => ({ play })) };
});

afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('soundManager', () => {
  it('play() triggers playback when not muted', () => {
    saveSettings({ ...DEFAULT_SETTINGS, muted: false });
    soundManager.play('tile-place');
    const instance = vi.mocked(Howl).mock.results[0]!.value as { play: () => void };
    expect(instance.play).toHaveBeenCalledOnce();
  });

  it('play() is a no-op when muted', () => {
    saveSettings({ ...DEFAULT_SETTINGS, muted: true });
    soundManager.play('tile-place');
    expect(vi.mocked(Howl)).not.toHaveBeenCalled();
  });

  it('setMuted persists through the settings store', () => {
    soundManager.setMuted(true);
    expect(loadSettings().muted).toBe(true);
    soundManager.setMuted(false);
    expect(loadSettings().muted).toBe(false);
  });

  it('reuses one Howl instance per sound id across calls', () => {
    saveSettings({ ...DEFAULT_SETTINGS, muted: false });
    soundManager.play('victory');
    soundManager.play('victory');
    expect(vi.mocked(Howl)).toHaveBeenCalledTimes(1);
  });
});
