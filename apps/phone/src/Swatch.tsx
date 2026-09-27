import { INDUSTRY_INFO, type Industry } from '@boomtown/engine';
import { patternedBackground } from '@desktop/game/industryTheme.js';

/**
 * A corporation's colour, the same chip the table's band and tray use — with
 * its industry pattern always on. The desktop makes patterns a setting; a
 * phone has no room for the settings panel, and the chip is small enough that
 * colour alone is the weakest way to tell two chains apart.
 */
export function Swatch({ industry }: { industry: Industry }) {
  return <span className="swatch" style={patternedBackground(industry, INDUSTRY_INFO[industry].color, true)} aria-hidden />;
}
