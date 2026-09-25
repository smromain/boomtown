import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Industry } from '@boomtown/engine';
import { INDUSTRY_ICONS } from '../../game/marks.js';

/** One filled outline of an industry mark, in the icon's own 24-unit box. */
export interface EmblemPath {
  readonly d: string;
  readonly evenOdd: boolean;
}

const cache = new Map<Industry, readonly EmblemPath[]>();

/**
 * The industry mark as path data, so the scene can paint it onto a tower's roof
 * with a plain canvas `fill` — synchronously, with no image to wait for. It is
 * read out of the very icon Board View and the panels draw, so the roof can
 * never show a different mark from the rest of the app.
 */
export function emblemPaths(industry: Industry): readonly EmblemPath[] {
  let found = cache.get(industry);
  if (!found) {
    const markup = renderToStaticMarkup(createElement(INDUSTRY_ICONS[industry]));
    const svg = new DOMParser().parseFromString(markup, 'image/svg+xml');
    found = Array.from(svg.querySelectorAll('path'), (path) => ({
      d: path.getAttribute('d') ?? '',
      evenOdd: path.getAttribute('fill-rule') === 'evenodd',
    })).filter((path) => path.d);
    cache.set(industry, found);
  }
  return found;
}
