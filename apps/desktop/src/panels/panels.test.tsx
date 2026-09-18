import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { GameState } from '@boomtown/engine';
import { BuyControls } from './BuyControls.js';
import { rowStanding } from './buying.js';
import { NAMES, mergedName, renderPanel, seedCorp } from '../testing/harness.js';

describe('BuyControls', () => {
  async function atBuyStep() {
    return renderPanel(<BuyControls />, {
      craft: (state) => {
        seedCorp(state, 'video', ['5H', '5I', '4I']); // size 3, tier 3 -> $500/share
        state.step = 'buy';
        state.hands[0] = [];
      },
    });
  }

  it('caps the total at three shares', async () => {
    await atBuyStep();
    const more = screen.getByRole('button', { name: `one more ${NAMES.video} share` });
    await userEvent.click(more);
    await userEvent.click(more);
    await userEvent.click(more);
    expect(more).toBeDisabled();
    expect(screen.getByText('Buy 3 for $1,500')).toBeInTheDocument();
  });

  it('stops incrementing when the next share is unaffordable', async () => {
    await renderPanel(<BuyControls />, {
      craft: (state) => {
        seedCorp(state, 'video', ['5H', '5I', '4I']);
        state.step = 'buy';
        state.hands[0] = [];
        state.seats[0]!.cash = 500;
      },
    });
    const more = screen.getByRole('button', { name: `one more ${NAMES.video} share` });
    await userEvent.click(more);
    expect(more).toBeDisabled();
  });

  it('stops incrementing when the bank runs out', async () => {
    await renderPanel(<BuyControls />, {
      craft: (state) => {
        seedCorp(state, 'video', ['5H', '5I', '4I']);
        state.step = 'buy';
        state.hands[0] = [];
        state.bankShares.video = 1;
      },
    });
    const more = screen.getByRole('button', { name: `one more ${NAMES.video} share` });
    await userEvent.click(more);
    expect(more).toBeDisabled();
  });

  it('shows how many shares are in the bank versus held', async () => {
    await renderPanel(<BuyControls />, {
      craft: (state) => {
        seedCorp(state, 'video', ['5H', '5I', '4I']);
        state.step = 'buy';
        state.hands[0] = [];
        state.bankShares.video = 18; // 25 - 18 = 7 held
      },
    });
    expect(screen.getByText('18 in bank · 7 held')).toBeInTheDocument();
  });

  // --- the row carries the corporation, not just its name (#58) --------

  it('names why a row cannot be bought into, rather than only disabling +', async () => {
    // Sold out: the float count is replaced by the reason, because "0 in bank"
    // is a number to work out and "Bank sold out" is a fact to read.
    await renderPanel(<BuyControls />, {
      craft: (state) => {
        seedCorp(state, 'video', ['5H', '5I', '4I']);
        state.step = 'buy';
        state.hands[0] = [];
        state.bankShares.video = 0;
      },
    });
    expect(screen.getByText('Bank sold out')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `one more ${NAMES.video} share` })).toBeDisabled();
  });

  it('says so when a share costs more than the seat holds', async () => {
    await renderPanel(<BuyControls />, {
      craft: (state) => {
        seedCorp(state, 'video', ['5H', '5I', '4I']); // $500 a share
        state.step = 'buy';
        state.hands[0] = [];
        state.seats[0]!.cash = 100;
      },
    });
    expect(screen.getByText('Not enough cash')).toBeInTheDocument();
  });

  it('keeps the standing note off a row that is merely at the three-share cap', async () => {
    // `canIncrement` goes false at three picked, which is not a fact about the
    // corporation — the row must not start claiming it is sold out.
    await atBuyStep();
    const more = screen.getByRole('button', { name: `one more ${NAMES.video} share` });
    await userEvent.click(more);
    await userEvent.click(more);
    await userEvent.click(more);
    expect(more).toBeDisabled();
    expect(screen.queryByText('Bank sold out')).not.toBeInTheDocument();
    expect(screen.queryByText('Not enough cash')).not.toBeInTheDocument();
    expect(screen.getByText('25 in bank · 0 held')).toBeInTheDocument();
  });

  it('draws the industry mark decoratively, never as another name for the row', async () => {
    // The steppers are driven through their aria labels by these tests and by
    // decisions.test.tsx; a mark that announced itself would put a second
    // accessible name on the row.
    const { container } = await atBuyStep();
    const marks = container.querySelectorAll('svg[aria-hidden="true"]');
    expect(marks.length).toBeGreaterThan(0);
    expect(container.querySelectorAll('svg:not([aria-hidden="true"])')).toHaveLength(0);
  });

  it('scrolls a merged name rather than widening the dialog', async () => {
    // A derived `displayName` accretes with every merger (`docs/naming.md`),
    // and the dialog used to size itself to whatever the longest one was — so
    // it moved and resized under the player from turn to turn. The name goes
    // through `Marquee`, the same answer the corp card gives to the same
    // problem, and the row's own width is the modal's.
    const { container } = await renderPanel(<BuyControls />, {
      craft: (state) => {
        seedCorp(state, 'video', ['5H', '5I', '4I']);
        state.corporations.video.eaten = [
          { industry: 'books', displayName: NAMES.books, flavours: [] },
          { industry: 'toys', displayName: NAMES.toys, flavours: [] },
        ];
        state.step = 'buy';
        state.hands[0] = [];
      },
    });
    const merged = mergedName('video', 'books', 'toys');
    expect(merged.length).toBeGreaterThan(NAMES.video.length); // it really did accrete
    // The name is inside a marquee viewport, not loose in the row.
    const viewport = container.querySelector('[class*="viewport"]');
    expect(viewport).not.toBeNull();
    expect(viewport!.textContent).toBe(merged);
    // And the full name still reaches assistive tech through the steppers,
    // which is where these controls get their accessible names from.
    expect(screen.getByRole('button', { name: `one more ${merged} share` })).toBeInTheDocument();
  });

  it('tracks the running total on the confirm button as rows are picked', async () => {
    await atBuyStep();
    expect(screen.getByText('Buy nothing and end turn')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: `one more ${NAMES.video} share` }));
    expect(screen.getByText('Buy 1 for $500')).toBeInTheDocument();
  });
});

describe('rowStanding', () => {
  /** A view where `video` is founded at size 3 (tier 3, $500) and seat 0 acts. */
  async function view(craft: (state: GameState) => void) {
    const { client } = await renderPanel(<BuyControls />, {
      craft: (state) => {
        seedCorp(state, 'video', ['5H', '5I', '4I']);
        state.step = 'buy';
        state.hands[0] = [];
        craft(state);
      },
    });
    return client.store.getState().views[0]!;
  }

  it('is available for a priced corporation the seat can afford', async () => {
    expect(rowStanding(await view(() => {}), 'video')).toBe('available');
  });

  it('is sold-out before it is too-dear, when it is both', async () => {
    // An empty bank is the harder fact: no amount of money buys a share that
    // does not exist, so that is the one worth naming.
    const v = await view((state) => {
      state.bankShares.video = 0;
      state.seats[0]!.cash = 0;
    });
    expect(rowStanding(v, 'video')).toBe('sold-out');
  });

  it('is too-dear when the price is above the seat\'s cash', async () => {
    expect(rowStanding(await view((state) => (state.seats[0]!.cash = 499)), 'video')).toBe('too-dear');
  });

  it('is available when the seat has exactly the price', async () => {
    expect(rowStanding(await view((state) => (state.seats[0]!.cash = 500)), 'video')).toBe('available');
  });
});
