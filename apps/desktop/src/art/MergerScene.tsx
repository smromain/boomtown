import { useMemo, type CSSProperties } from 'react';
import type { Industry } from '@boomtown/engine';
import { industryTheme } from '../game/industryTheme.js';
import { mergerScene } from './mergerScenes.js';

/**
 * A merger, drawn (Game Night skin, prototype): the survivor's headquarters,
 * and a crane swinging the company it is taking across to it. Any survivor
 * can meet any defunct company, so the drawing is assembled from the pair.
 */
export function MergerScene({
  survivor,
  defunct,
  className,
}: {
  survivor: Industry;
  defunct: Industry;
  className?: string | undefined;
}) {
  const style = {
    '--gn-c': industryTheme(survivor).color,
    '--gn-t': industryTheme(defunct).color,
  } as CSSProperties;
  // A fresh `{ __html }` object each render makes React rewrite the SVG's
  // insides, which restarts the crane's swing at every step of the merger
  // beat. Keep the same object while the pair is the same.
  const html = useMemo(() => ({ __html: mergerScene(survivor, defunct) }), [survivor, defunct]);
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 600 150"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden
      dangerouslySetInnerHTML={html}
    />
  );
}
