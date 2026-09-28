import type { CSSProperties } from 'react';
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
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 600 150"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden
      dangerouslySetInnerHTML={{ __html: mergerScene(survivor, defunct) }}
    />
  );
}
