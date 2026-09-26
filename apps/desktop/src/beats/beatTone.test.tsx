import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { industryTheme } from '../game/industryTheme.js';
import { setLighting } from '../board/boardPrefs.js';
import { useBeatSkylineTone, useBeatType } from './beatTone.js';

describe('the beat curtain follows the day/night setting (#64)', () => {
  afterEach(() => {
    act(() => setLighting('day'));
  });

  it('sets coloured type in the paper shade by day and the night shade at night', () => {
    act(() => setLighting('day'));
    const { result } = renderHook(() => useBeatType());
    expect(result.current('air')).toBe(industryTheme('air').onPaper);

    act(() => setLighting('night'));
    expect(result.current('air')).toBe(industryTheme('air').onNight);
  });

  it('draws the victory skyline dark by day and light at night', () => {
    act(() => setLighting('day'));
    const { result } = renderHook(() => useBeatSkylineTone());
    expect(result.current).toBe('ink');

    act(() => setLighting('night'));
    expect(result.current).toBe('chrome');
  });
});
