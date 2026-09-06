import { act } from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Cell, GameState, Industry, TileId } from '@boomtown/engine';
import { describe, expect, it } from 'vitest';
import { BuyControls } from './BuyControls.js';
import { EventLog } from './EventLog.js';
import { HandRack } from './HandRack.js';
import { Holdings } from './Holdings.js';
import { Market } from './Market.js';
import { flush, renderPanel } from './harness.js';

function seedCorp(state: GameState, industry: Industry, tiles: TileId[]): void {
  const corp = state.corporations[industry];
  corp.founded = true;
  corp.tiles = [...tiles];
  corp.hqTile = tiles[0] ?? null;
  for (const tile of tiles) state.cells[tile] = { kind: 'corporation', industry } satisfies Cell;
}

describe('HandRack', () => {
  it('labels each tile with its effect and disables dead / blocked ones', async () => {
    await renderPanel(<HandRack />, {
      craft: (state) => {
        seedCorp(state, 'video', ['1A', '2A', '3A', '4A', '5A', '6A', '7A', '8A', '9A', '1B', '11A']);
        seedCorp(state, 'books', ['1C', '2C', '3C', '4C', '5C', '6C', '7C', '8C', '9C', '10C', '11C']);
        state.hands[0] = ['2B', '6E']; // 2B merges two safe corps -> dead; 6E is isolated -> nothing
      },
    });

    const dead = screen.getByRole('button', { name: /2B/ });
    expect(dead).toHaveAttribute('data-effect', 'dead');
    expect(dead).toBeDisabled();

    const ok = screen.getByRole('button', { name: /6E/ });
    expect(ok).toHaveAttribute('data-effect', 'nothing');
    expect(ok).toBeEnabled();
  });
});

describe('Holdings', () => {
  it('hides opponent cash under the "hidden" table setting', async () => {
    await renderPanel(<Holdings />, { visibility: 'hidden' });
    const rows = screen.getAllByRole('row').slice(1); // drop header
    expect(within(rows[0]!).getByText('$6000')).toBeInTheDocument(); // own seat
    expect(within(rows[1]!).getAllByText('—').length).toBeGreaterThan(0); // opponent
  });

  it('shows opponent cash under the "open" setting', async () => {
    await renderPanel(<Holdings />, { visibility: 'open' });
    expect(screen.getAllByText('$6000')).toHaveLength(3);
  });
});

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
    const more = screen.getByRole('button', { name: 'more video' });
    await userEvent.click(more);
    await userEvent.click(more);
    await userEvent.click(more);
    expect(more).toBeDisabled(); // the fourth is refused
    expect(screen.getByText('Buy 3 for $1500')).toBeInTheDocument();
  });

  it('stops incrementing when the next share is unaffordable', async () => {
    const { client } = await renderPanel(<BuyControls />, {
      craft: (state) => {
        seedCorp(state, 'video', ['5H', '5I', '4I']);
        state.step = 'buy';
        state.hands[0] = [];
        state.seats[0]!.cash = 500; // one share, then broke
      },
    });
    void client;
    const more = screen.getByRole('button', { name: 'more video' });
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
    const more = screen.getByRole('button', { name: 'more video' });
    await userEvent.click(more);
    expect(more).toBeDisabled();
  });
});

describe('Market and EventLog through a merger', () => {
  async function mergeVideoAndBooks() {
    return renderPanel(
      <>
        <Market />
        <EventLog />
      </>,
      {
        craft: (state) => {
          seedCorp(state, 'video', ['2E', '3E', '4E']); // larger -> survives
          seedCorp(state, 'books', ['6E', '7E']);
          state.hands[0] = ['5E']; // nobody holds books, so disposal is skipped
        },
      },
    );
  }

  it('the market card shows the derived display name, not the base name', async () => {
    const { client } = await mergeVideoAndBooks();
    await act(async () => {
      client.dispatch({ type: 'place-tile', seat: 0, tile: '5E' });
      await flush();
    });

    const market = screen.getByRole('region', { name: 'Market' });
    expect(within(market).queryByText('Megahit Video')).not.toBeInTheDocument();
    expect(within(market).getByText(/^Megahit/)).toBeInTheDocument(); // stem kept, fragment appended
  });

  it('the event log renders each step of the merger', async () => {
    const { client } = await mergeVideoAndBooks();
    await act(async () => {
      client.dispatch({ type: 'place-tile', seat: 0, tile: '5E' });
      await flush();
    });

    const log = screen.getByRole('region', { name: 'Event log' });
    expect(within(log).getByText(/Merger at 5E/)).toBeInTheDocument();
    expect(within(log).getByText(/video survives/i)).toBeInTheDocument();
    expect(within(log).getByText(/books folded into video/i)).toBeInTheDocument();
    expect(within(log).getByText(/Merger complete/i)).toBeInTheDocument();
  });
});
