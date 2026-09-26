import type { Industry } from '@boomtown/engine';
import { useBoardPrefs } from '../board/boardPrefs.js';
import { industryTheme } from '../game/industryTheme.js';

/**
 * A corporation's colour as type on the beat curtain (#64). The curtain takes
 * the day/night setting's tone, so its coloured type does too: the paper shade
 * by day, the night shade at night. CSS tokens cannot carry a per-industry
 * choice, so this is the one piece of the curtain's tone chosen in script.
 */
export function useBeatType(): (industry: Industry) => string {
  const { lighting } = useBoardPrefs();
  return (industry) => (lighting === 'night' ? industryTheme(industry).onNight : industryTheme(industry).onPaper);
}

/** The skyline silhouette that reads on the curtain: dark by day, light at night. */
export function useBeatSkylineTone(): 'ink' | 'chrome' {
  return useBoardPrefs().lighting === 'night' ? 'chrome' : 'ink';
}
