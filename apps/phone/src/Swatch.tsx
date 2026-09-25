import { INDUSTRY_INFO, type Industry } from '@boomtown/engine';

/** A corporation's colour, the same chip the table's band and tray use. */
export function Swatch({ industry }: { industry: Industry }) {
  return <span className="swatch" style={{ background: INDUSTRY_INFO[industry].color }} aria-hidden />;
}
