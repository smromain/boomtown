import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { INDUSTRY_INFO } from '@boomtown/engine';
import { Board } from './Board.js';
import { NAMES, flush, renderPanel, seedCorp } from '../testing/harness.js';
import { loadSettings, saveSettings } from '../settings/settings.js';

const boardCss = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'board.module.css'), 'utf8');

describe('Board', () => {
  it('renders every cell plus the perimeter headers', async () => {
    await renderPanel(<Board />);
    const grid = screen.getByRole('grid', { name: 'Board' });
    // 108 cells; jsdom exposes them as gridcell
    expect(within(grid).getAllByRole('gridcell')).toHaveLength(108);
    // column headers 1..12 and row headers A..I are aria-hidden, so query by text
    expect(within(grid).getByText('12')).toBeInTheDocument();
  });

  it('a founded corporation cell carries its industry colour and name', async () => {
    await renderPanel(<Board />, {
      craft: (state) => seedCorp(state, 'video', ['6E', '7E', '8E']),
    });
    // the accessible name carries "<coord> — <company name>"
    const cell = screen.getByRole('gridcell', { name: new RegExp(`^6E — ${NAMES.video}`) });
    // the crafted lit-paper treatment (U8) is a gradient, not a flat fill, but
    // it's built from the industry's own colour and carries visible thickness.
    expect(cell.style.background).toContain(INDUSTRY_INFO.video.color);
    expect(cell.style.transform).toMatch(/translateZ/);
    expect(cell.style.boxShadow).not.toBe('');
  });

  it('the headquarters cell shows the industry mark and the coordinate', async () => {
    await renderPanel(<Board />, {
      craft: (state) => seedCorp(state, 'video', ['6E', '7E', '8E']), // hqTile = 6E
    });
    const hq = screen.getByRole('gridcell', { name: /^6E — / });
    expect(within(hq).getByText('6E')).toBeInTheDocument();
    expect(hq.querySelector('svg')).toBeTruthy(); // IndustryMark
  });

  it('every corporation cell carries its industry glyph, not just the headquarters (#18)', async () => {
    await renderPanel(<Board />, {
      craft: (state) => seedCorp(state, 'video', ['6E', '7E', '8E']), // hqTile = 6E
    });
    // Colour alone made a merger a one-channel change on every tile but the HQ.
    // The glyph is the second channel, and it is what survives a close pair of
    // colours or a player who cannot separate them at all.
    for (const tile of ['7E', '8E']) {
      const cell = screen.getByRole('gridcell', { name: new RegExp(`^${tile} — `) });
      expect(within(cell).getByText(tile)).toBeInTheDocument();
      expect(cell.querySelector('svg')).toBeTruthy();
    }
    // an empty cell stays bare — the glyph means "this belongs to someone"
    expect(screen.getByRole('gridcell', { name: '1A' }).querySelector('svg')).toBeNull();
  });

  describe('industry patterns (#19)', () => {
    afterEach(() => localStorage.clear());

    const corpCells = () => screen.getAllByRole('gridcell', { name: / — / });
    const texture = (cell: HTMLElement) => cell.style.getPropertyValue('--industry-pattern');

    it('draws no texture by default', async () => {
      await renderPanel(<Board />, {
        craft: (state) => seedCorp(state, 'video', ['6E', '7E', '8E']),
      });
      for (const cell of corpCells()) {
        expect(texture(cell)).toBe('');
        expect(cell.style.background).not.toContain('var(--industry-pattern)');
      }
    });

    it('textures every corporation cell when on, and keeps the glyph and the accessible name', async () => {
      saveSettings({ ...loadSettings(), industryPatterns: true });
      await renderPanel(<Board />, {
        craft: (state) => seedCorp(state, 'video', ['6E', '7E', '8E']),
      });
      const cells = corpCells();
      expect(cells).toHaveLength(3);
      for (const cell of cells) {
        // video's vertical rules, layered in front of the fill it already had
        expect(texture(cell)).toMatch(/repeating-linear-gradient\(90deg/);
        expect(cell.style.background).toMatch(/^var\(--industry-pattern\), linear-gradient/);
        expect(cell.style.background).toContain(INDUSTRY_INFO.video.color);
        expect(cell.querySelector('svg')).toBeTruthy();
      }
      // an empty cell stays bare
      expect(texture(screen.getByRole('gridcell', { name: '1A' }))).toBe('');
    });

    it('takes effect on a board already on screen', async () => {
      await renderPanel(<Board />, {
        craft: (state) => seedCorp(state, 'video', ['6E', '7E', '8E']),
      });
      act(() => saveSettings({ ...loadSettings(), industryPatterns: true }));
      for (const cell of corpCells()) expect(texture(cell)).not.toBe('');
      act(() => saveSettings({ ...loadSettings(), industryPatterns: false }));
      for (const cell of corpCells()) expect(texture(cell)).toBe('');
    });
  });

  it('transitions cell colour so a merger recolour is visible, and stands down for reduced motion', () => {
    // An instant repaint is a change between two frames with nothing to catch
    // the eye; the transition is what makes a takeover readable (#18).
    const cellRule = boardCss.slice(boardCss.indexOf('.cell {'), boardCss.indexOf('.corpCell'));
    expect(cellRule).toMatch(/transition:[\s\S]*background/);
    expect(boardCss).toMatch(/prefers-reduced-motion[\s\S]*\.cell\s*\{[\s\S]*transition: none/);
  });

  it('placeable cells are buttons that dispatch a placement', async () => {
    const { client } = await renderPanel(<Board />);
    // opening board: every hand tile is playable
    const playables = screen.getAllByRole('gridcell').filter((c) => c.tagName === 'BUTTON');
    expect(playables.length).toBe(6);

    const tile = playables[0]!.getAttribute('aria-label')!.replace('Place at ', '');
    await act(async () => {
      await userEvent.click(playables[0]!);
      await flush();
    });
    expect(client.store.getState().views[0]!.cells[tile as keyof object]).toBeDefined();
  });

  it('is not interactive off the placement step', async () => {
    await renderPanel(<Board />, {
      craft: (state) => {
        state.step = 'buy';
      },
    });
    expect(screen.queryAllByRole('gridcell').filter((c) => c.tagName === 'BUTTON')).toHaveLength(0);
  });

  it('renders nothing when the active seat is not local (a bot / remote turn)', async () => {
    await renderPanel(<Board />, {
      localSeats: [0],
      craft: (state) => {
        state.turnPointer = 1;
      },
    });
    expect(screen.queryByRole('grid', { name: 'Board' })).not.toBeInTheDocument();
  });

  it('has visible depth styling (transform + shadow) and no wood/felt/plastic texture image (U8, AE1)', () => {
    expect(boardCss).toMatch(/rotateX\(/);
    expect(boardCss).toMatch(/box-shadow:\s*\n?\s*var\(--elev-3\)/);
    expect(boardCss).not.toMatch(/wood|felt|plastic|canvas\.png|paper\.jpg/i);
  });

  it('reduces the tilt under prefers-reduced-motion (U8, U12)', () => {
    const reducedBlock = boardCss.slice(boardCss.indexOf('@media (prefers-reduced-motion: reduce) {'));
    expect(reducedBlock).toMatch(/\.board\s*{\s*\n\s*transform:\s*none;/);
  });
});
