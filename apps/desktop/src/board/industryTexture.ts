import { CanvasTexture, SRGBColorSpace, type Texture } from 'three';
import { INDUSTRY_INFO, type Industry } from '@boomtown/engine';

/**
 * The per-industry line mark from `src/game/marks.tsx`, kept in sync here.
 * (marks.tsx is a React SVG component and can't be imported into the R3F scene;
 * the board rasterises the same paths to a texture for the HQ badge.)
 */
const PATHS: Record<Industry, string> = {
  books: 'M12 7v13M12 7C10 5 7 4.5 3 5v13c4-.5 7 0 9 2M12 7c2-2 5-2.5 9-2v13c-4-.5-7 0-9 2',
  electronics: 'M3 10h18v10H3zM8 15a2 2 0 1 0 0-.01M13 14h5M13 17h5M8 10 17 3',
  air: 'M12 2c3 3 3 17 0 20-3-3-3-17 0-20zM2 12h20M4.5 7.5c4.7 2 10.3 2 15 0M4.5 16.5c4.7-2 10.3-2 15 0',
  energy: 'M13 3l-7 10h5l-1 8 7-10h-5z',
  tech: 'M6 2h12v20H6zM9 6h6M9 11h2M13 11h2M9 14h2M13 14h2M9 17h6',
  video: 'M2 6h20v12H2zM8 12a2.5 2.5 0 1 0 0-.01M16 12a2.5 2.5 0 1 0 0-.01M2 9h20',
  toys: 'M3 9h12v12H3zM7 13h4M9 11v4M17 3l1.6 3.3 3.4.5-2.5 2.4.6 3.6-3.1-1.7-3.1 1.7.6-3.6L12 6.8l3.4-.5z',
};

const SIZE = 128; // texture is square; the mark is drawn on a transparent ground

const cache = new Map<string, Texture>();

/**
 * A cached `CanvasTexture` of an industry's mark, stroked in `color` on a
 * transparent background. Used on the headquarters badge so the board shows a
 * recognisable pictogram (a book, a bolt, a plane) instead of an opaque letter.
 */
export function industryMarkTexture(industry: Industry, color = '#ffffff'): Texture {
  const key = `${industry}:${color}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof Path2D === 'undefined') {
    // no 2D canvas (jsdom, a locked-down runtime) — the caller falls back to text
    throw new Error('industryMarkTexture: no 2D canvas context');
  }

  const scale = SIZE / 24; // paths are authored in a 0..24 viewBox
  ctx.scale(scale, scale);
  ctx.translate(2, 2); // small inset so strokes near the edge aren't clipped
  ctx.scale(20 / 24, 20 / 24);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(PATHS[industry]));

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  cache.set(key, texture);
  return texture;
}

/** The default white mark for an industry — the badge ink. */
export function hqMarkTexture(industry: Industry): Texture {
  return industryMarkTexture(industry, '#ffffff');
}

/** First letter of the company name — the fallback if a texture can't be drawn
 *  (e.g. no 2D canvas). The design's badge shows the company initial, not the
 *  industry key. */
export function companyInitial(baseName: string): string {
  return (baseName.trim()[0] ?? '?').toUpperCase();
}

export { INDUSTRY_INFO };
