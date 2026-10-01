import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXPORT_PALETTE, exportDrawing, importDrawing, normaliseColour, type Dom } from './kit.js';

const DRAWINGS = path.join(__dirname, 'drawings');
const dom: Dom = { DOMParser, XMLSerializer };
const names = fs
  .readdirSync(DRAWINGS, { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.svg'))
  .map((file) => file.split(path.sep).join('/'))
  .sort();
const read = (name: string) => fs.readFileSync(path.join(DRAWINGS, name), 'utf8');
const LOAD = read('mergers/load-air.svg');
const bring = (file: string, was = LOAD) => importDrawing(dom, file, was, 'mergers/load-air');

describe('the art kit', () => {
  it('finds every drawing', () => {
    expect(names).toHaveLength(39);
  });

  it.each(names)('takes %s out and back unchanged', (name) => {
    const file = read(name);
    const out = exportDrawing(dom, file);
    expect(out).not.toContain('var(');
    const back = bring(out, file);
    expect(back.svg).toBe(file);
    expect(back.newColours).toEqual([]);
    expect(back.warnings).toEqual([]);
  });

  it('gives every token its own colour', () => {
    const hexes = Object.values(EXPORT_PALETTE).map(({ hex }) => hex);
    expect(new Set(hexes).size).toBe(hexes.length);
  });

  it('reads colours however an editor writes them', () => {
    expect(normaliseColour('#FFF')).toBe('#ffffff');
    expect(normaliseColour('rgb(28, 42, 71)')).toBe('#1c2a47');
    expect(normaliseColour('none')).toBe('none');
  });

  it("undoes Illustrator's classes, layer group and moved canvas", () => {
    const file = `<?xml version="1.0" encoding="utf-8"?>
<!-- Generator: Adobe Illustrator 28.0.0 -->
<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px"
	 viewBox="0 0 92 80" style="enable-background:new 0 0 92 80;" xml:space="preserve">
<style type="text/css">
	.st0{fill:#2A9D8F;stroke:#1C2A47;stroke-width:2;}
	.st1{fill:none;stroke:#1C2A48;stroke-opacity:0.2;}
</style>
<g>
	<rect x="8" y="16" class="st0" width="10" height="10"/>
	<path class="st1" d="M0 0 L5 5"/>
</g>
</svg>`;
    expect(bring(file).svg).toBe(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-8 -16 92 80">
<g transform="translate(-8 -16)">
<rect x="8" y="16" width="10" height="10" fill="var(--gn-c)" stroke="var(--gn-line)" stroke-width="2"/>
<path d="M0 0 L5 5" fill="none" stroke="var(--gn-trail)"/>
</g>
</svg>
`);
  });

  it("drops Inkscape's metadata, keeps its styles and names its ids", () => {
    const file = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
  xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" viewBox="-8 -16 92 80" width="184" height="160">
<sodipodi:namedview id="namedview1" inkscape:zoom="4"/>
<metadata><title>load</title></metadata>
<defs id="defs1"><linearGradient id="grad"><stop offset="0" stop-color="#FFD166"/></linearGradient></defs>
<g inkscape:label="Layer 1" inkscape:groupmode="layer" id="layer1">
<path id="path1" d="M0 0 H10" style="fill:url(#grad);stroke:#123456;stroke-width:1.5"/>
</g>
</svg>`;
    const back = bring(file);
    expect(back.svg).toBe(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-8 -16 92 80">
<defs><linearGradient id="mergers-load-air-grad"><stop offset="0" stop-color="var(--gn-sun)"/></linearGradient></defs>
<path d="M0 0 H10" style="fill:url(#mergers-load-air-grad);stroke:#123456;stroke-width:1.5"/>
</svg>
`);
    expect(back.newColours).toEqual(['#123456']);
  });

  it('rescales a canvas that kept its shape', () => {
    const file = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 184 160"><circle r="4" fill="#fff"/></svg>`;
    expect(bring(file).svg).toContain('<g transform="translate(-8 -16) scale(0.5)"><circle r="4" fill="var(--gn-lite)"/></g>');
  });

  it('refuses what would not draw the same', () => {
    const svg = (inner: string, box = '-8 -16 92 80') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}">${inner}</svg>`;
    expect(() => bring(svg('<text>Hi</text>'))).toThrow(/outlines/);
    expect(() => bring(svg('<image href="a.png"/>'))).toThrow(/pictures/);
    expect(() => bring(svg('', '0 0 100 100'))).toThrow(/changed shape/);
  });
});
