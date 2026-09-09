import { act } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGame, viewFor, type Cell, type GameState, type Industry, type TileId } from '@boomtown/engine';
import { VictoryBeat } from './VictoryBeat.js';

vi.mock('../../audio/soundManager.js', () => ({ soundManager: { play: vi.fn(), isMuted: () => false, setMuted: vi.fn() } }));

const SEATS = [{ name: 'Ana' }, { name: 'Ben' }, { name: 'Cy' }];
const COMPANY_DRAW = { books: 0, electronics: 0, air: 0, energy: 0, tech: 0, video: 0, toys: 0 } as const;

function found(state: GameState, industry: Industry, tiles: readonly TileId[]): void {
  const corp = state.corporations[industry];
  corp.founded = true;
  corp.tiles = [...tiles];
  corp.hqTile = tiles[0] ?? null;
  for (const tile of tiles) state.cells[tile] = { kind: 'corporation', industry } satisfies Cell;
}

/**
 * Seat 2 (Cy) last with $2,000, seat 0 (Ana) middle with $4,000, seat 1 (Ben)
 * wins with $6,000 — reveal order is last-to-first: Cy, then Ana, then Ben.
 */
function victoryView() {
  const state = createGame({ seats: SEATS, seed: 1, turnOrder: [0, 1, 2], companyDraw: COMPANY_DRAW });
  found(state, 'video', ['2E', '3E', '4E']);
  found(state, 'books', ['6C', '7C']);
  state.status = 'over';
  state.endAnnouncedBy = 1;
  state.result = {
    rankings: [
      {
        seat: 1,
        cash: 1500,
        equity: 4500,
        total: 6000,
        holdings: [
          { industry: 'video', shares: 5, price: 600, saleValue: 3000, bonus: 1000 },
          { industry: 'books', shares: 1, price: 500, saleValue: 500, bonus: 0 },
        ],
      },
      {
        seat: 0,
        cash: 2000,
        equity: 2000,
        total: 4000,
        holdings: [{ industry: 'video', shares: 3, price: 600, saleValue: 1800, bonus: 200 }],
      },
      {
        seat: 2,
        cash: 1000,
        equity: 1000,
        total: 2000,
        holdings: [{ industry: 'books', shares: 2, price: 500, saleValue: 1000, bonus: 0 }],
      },
    ],
    winners: [1],
  };
  return viewFor(state, 0);
}

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

/** The cascade's opacity/height styling lives on the line's wrapper div, not
 *  the text node `getByText` returns — the text's immediate parent. */
function lineOf(container: HTMLElement, text: string | RegExp): HTMLElement {
  return within(container).getByText(text).parentElement!;
}

describe('VictoryBeat cascade', () => {
  it('opens on the last-place seat, cash line first, headline and totals still hidden', async () => {
    render(<VictoryBeat view={victoryView()} dismiss={vi.fn()} />);
    const dialog = await screen.findByRole('dialog', { name: 'Victory' });

    expect(within(dialog).getByText('Ben wins')).toHaveStyle({ opacity: '0' });
    // whose numbers these are stays hidden until the total lands
    expect(within(dialog).getByText('3rd place')).toBeInTheDocument();
    expect(within(dialog).getByText('3. ?')).toBeInTheDocument();
    expect(within(dialog).queryByText(/Cy/)).not.toBeInTheDocument();
    expect(lineOf(dialog, 'cash on hand: $1,000')).toHaveStyle({ opacity: '1' });
    expect(lineOf(dialog, /2 shares of/)).toHaveStyle({ opacity: '0' });
    expect(lineOf(dialog, 'total: $2,000')).toHaveStyle({ opacity: '0' });

    // nobody has settled into the standings list yet
    for (const total of ['$6,000', '$4,000', '$2,000']) {
      expect(within(dialog).queryByText(total)).not.toBeInTheDocument();
    }
  });

  it('a click advances one line; the name lands with the total, then the seat settles into the standings', async () => {
    render(<VictoryBeat view={victoryView()} dismiss={vi.fn()} />);
    const dialog = await screen.findByRole('dialog', { name: 'Victory' });

    // Cy: cash (shown already) -> holding -> total
    await act(async () => {
      await userEvent.click(dialog);
    });
    expect(lineOf(dialog, /2 shares of/)).toHaveStyle({ opacity: '1' });
    expect(within(dialog).getByText('3rd place')).toBeInTheDocument(); // still anonymous
    expect(within(dialog).queryByText('$2,000')).not.toBeInTheDocument();

    await act(async () => {
      await userEvent.click(dialog);
    });
    // the total lands and Cy's name pops in — in her own card and the standings row
    expect(lineOf(dialog, 'total: $2,000')).toHaveStyle({ opacity: '1' });
    expect(within(dialog).getAllByText('3. Cy')).toHaveLength(2);
    expect(within(dialog).getByText('$2,000')).toBeInTheDocument();

    // One more click moves on to Ana's card — anonymous again, starting from her cash line.
    await act(async () => {
      await userEvent.click(dialog);
    });
    expect(within(dialog).getByText('2nd place')).toBeInTheDocument();
    expect(within(dialog).getByText('2. ?')).toBeInTheDocument();
    expect(lineOf(dialog, 'cash on hand: $2,000')).toHaveStyle({ opacity: '1' });
  });

  it('running the full cascade reveals the headline and every total; a further click dismisses', async () => {
    const dismiss = vi.fn();
    render(<VictoryBeat view={victoryView()} dismiss={dismiss} />);
    const dialog = await screen.findByRole('dialog', { name: 'Victory' });

    // 10 lines total (Cy: 3, Ana: 3, Ben: 4); the first is already shown on
    // mount, so 10 clicks land on the fully-revealed, pre-headline state —
    // clicking through rather than waiting out the real-time holds.
    for (let i = 0; i < 10; i++) {
      await act(async () => {
        await userEvent.click(dialog);
      });
    }

    expect(within(dialog).getByText('Ben wins')).toHaveStyle({ opacity: '1' });
    for (const total of ['$6,000', '$4,000', '$2,000']) {
      expect(within(dialog).getByText(total)).toBeInTheDocument();
    }
    expect(within(dialog).getByText('click or press space to continue')).toBeInTheDocument();

    await act(async () => {
      await userEvent.click(dialog);
    });
    expect(dismiss).toHaveBeenCalledOnce();
  });

  it('prefers-reduced-motion skips the cascade: everything settled immediately', async () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    try {
      const dismiss = vi.fn();
      render(<VictoryBeat view={victoryView()} dismiss={dismiss} />);
      const dialog = await screen.findByRole('dialog', { name: 'Victory' });

      expect(within(dialog).getByText('Ben wins')).toHaveStyle({ opacity: '1' });
      for (const total of ['$6,000', '$4,000', '$2,000']) {
        expect(within(dialog).getByText(total)).toBeInTheDocument();
      }

      await act(async () => {
        await userEvent.click(dialog);
      });
      expect(dismiss).toHaveBeenCalledOnce();
    } finally {
      window.matchMedia = original;
    }
  });
});
