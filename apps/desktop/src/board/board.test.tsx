import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { INDUSTRY_INFO } from '@boomtown/engine';
import { Board } from './Board.js';
import { NAMES, flush, renderPanel, seedCorp } from '../testing/harness.js';

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
    expect(cell).toHaveStyle({ background: INDUSTRY_INFO.video.color });
  });

  it('the headquarters cell shows the industry mark and the coordinate', async () => {
    await renderPanel(<Board />, {
      craft: (state) => seedCorp(state, 'video', ['6E', '7E', '8E']), // hqTile = 6E
    });
    const hq = screen.getByRole('gridcell', { name: /^6E — / });
    expect(within(hq).getByText('6E')).toBeInTheDocument();
    expect(hq.querySelector('svg')).toBeTruthy(); // IndustryMark
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
});
