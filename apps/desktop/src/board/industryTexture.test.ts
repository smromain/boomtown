import { describe, expect, it, vi } from 'vitest';
import { companyInitial, hqMarkTexture, industryMarkTexture } from './industryTexture.js';

describe('companyInitial', () => {
  it('is the first letter of the company name, upper-cased', () => {
    expect(companyInitial('Megahit Video')).toBe('M');
    expect(companyInitial('  wattage  ')).toBe('W');
  });

  it('never blows up on an empty name', () => {
    expect(companyInitial('')).toBe('?');
  });
});

describe('industryMarkTexture', () => {
  it('throws under jsdom (no 2D canvas) so the caller can fall back to text', () => {
    // jsdom's HTMLCanvasElement.getContext('2d') returns null
    expect(() => industryMarkTexture('energy')).toThrow(/no 2D canvas/);
    expect(() => hqMarkTexture('books')).toThrow(/no 2D canvas/);
  });

  it('rasterises and caches one texture per (industry, colour) when a canvas is available', () => {
    // fake a working 2D context
    const fakeCtx = {
      scale: vi.fn(),
      translate: vi.fn(),
      stroke: vi.fn(),
      lineWidth: 0,
      lineCap: '',
      lineJoin: '',
      strokeStyle: '',
    };
    const spy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(fakeCtx as unknown as CanvasRenderingContext2D);
    const P2D = globalThis.Path2D;
    // @ts-expect-error minimal stub
    globalThis.Path2D = class {};

    try {
      const a = industryMarkTexture('video', '#fff');
      const b = industryMarkTexture('video', '#fff');
      expect(a).toBe(b); // cached
      expect(industryMarkTexture('video', '#000')).not.toBe(a); // colour is part of the key
      expect(fakeCtx.stroke).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      globalThis.Path2D = P2D;
    }
  });
});
