import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { BuyControls } from './BuyControls.js';
import { NAMES, renderPanel, seedCorp } from '../testing/harness.js';

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
});
