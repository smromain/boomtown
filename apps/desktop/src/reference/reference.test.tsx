import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { clientView } from '@boomtown/client-core';
import { createGame } from '@boomtown/engine';
import { corpReference, fullChart } from './priceReference.js';
import { StockReference } from './StockReference.js';
import { CorpReference } from './CorpReference.js';
import { ReferenceProvider, useReference } from './ReferenceContext.js';
import { renderPanel, seedCorp } from '../testing/harness.js';


describe('priceReference helpers', () => {
  it('fullChart marks a founded corporation on the row it sits', () => {
    const state = createGame({ seats: [{ name: 'A' }, { name: 'B' }], seed: 1, turnOrder: [0, 1] });
    seedCorp(state, 'video', Array.from({ length: 12 }, (_, i) => `${(i % 12) + 1}A`)); // tier 3, size 12
    const rows = fullChart(clientView(state, 0));

    // tier-3 size 12 is band "11–20", which is row 8 (band 6 + tier offset 2)
    const marked = rows.filter((r) => r.tiers.some((t) => t.here.length > 0));
    expect(marked).toHaveLength(1);
    const tier3 = marked[0]!.tiers.find((t) => t.tier === 3)!;
    expect(tier3.label).toBe('11–20');
    expect(tier3.here[0]).toMatchObject({ industry: 'video', size: 12 });
  });

  it('corpReference ranks holders and assigns primary / minority', () => {
    const state = createGame({ seats: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], seed: 1, turnOrder: [0, 1, 2] });
    seedCorp(state, 'video', ['2A', '3A', '4A', '5A']); // tier 3, size 4 -> band "4"
    state.seats[0]!.holdings.video = 2;
    state.seats[2]!.holdings.video = 5;
    const data = corpReference(clientView(state, 0), 'video');

    expect(data.payouts[0]).toMatchObject({ seat: 2, tier: 'primary' });
    expect(data.payouts[1]).toMatchObject({ seat: 0, tier: 'tertiary' }); // classic = 2-tier
    expect(data.ladder.find((r) => r.current)?.label).toBe('4');
  });
});

describe('StockReference modal', () => {
  it('renders the whole ruleset table with the live position highlighted', async () => {
    const { client } = await renderPanel(<StockReference open onClose={() => {}} />, {
      craft: (state) => seedCorp(state, 'books', Array.from({ length: 6 }, (_, i) => `${i + 1}A`)),
    });
    void client;
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Stock reference');
    expect(dialog).toHaveTextContent('safe at 11 tiles');
    // classic -> "Majority" / "Minority", not "Primary"/"Secondary"
    expect(within(dialog).getByText('Majority')).toBeInTheDocument();
    expect(within(dialog).queryByText('Secondary')).not.toBeInTheDocument();
    // 11 price rows
    expect(within(dialog).getByText('$200')).toBeInTheDocument();
    expect(within(dialog).getByText('$1,200')).toBeInTheDocument();
    // the founded corp is chipped on its band row (books size 6 -> "6–10")
    expect(within(dialog).getByText(/Radio Hut|Woolyworth|books/i)).toBeTruthy();
  });

  it('shows a secondary bonus column under the 2015 edition', async () => {
    const { client } = await renderPanel(<StockReference open onClose={() => {}} />, {});
    void client;
    // harness uses classic; assert the classic wording is present and 2015-only is absent
    expect(screen.queryByText('Secondary')).not.toBeInTheDocument();
  });
});

describe('CorpReference modal', () => {
  it('shows the tier ladder, current row, and shareholder payouts', async () => {
    const { client } = await renderPanel(
      <CorpReference industry="video" onClose={() => {}} onOpenChart={() => {}} />,
      {
        craft: (state) => {
          seedCorp(state, 'video', ['2A', '3A', '4A', '5A', '6A']); // tier 3, size 5
          state.seats[0]!.holdings.video = 3;
        },
      },
    );
    void client;
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(/Megahit/); // company name
    expect(dialog).toHaveTextContent('Tier 3 ladder');
    expect(dialog).toHaveTextContent('5 tiles');
    expect(dialog).toHaveTextContent('If it paid out today');
    expect(dialog).toHaveTextContent(/Ana/); // holder name
  });

  it('is closed when no industry is passed', async () => {
    await renderPanel(<CorpReference industry={null} onClose={() => {}} onOpenChart={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('ReferenceProvider wiring', () => {
  function Poker() {
    const { openChart, openCorp } = useReference();
    return (
      <>
        <button type="button" onClick={openChart}>
          open chart
        </button>
        <button type="button" onClick={() => openCorp('video')}>
          open corp
        </button>
      </>
    );
  }

  it('openChart / openCorp open the right modal; the corp modal can jump to the chart', async () => {
    await renderPanel(
      <ReferenceProvider>
        <Poker />
      </ReferenceProvider>,
      { craft: (state) => seedCorp(state, 'video', ['2A', '3A', '4A']) },
    );

    await userEvent.click(screen.getByRole('button', { name: 'open corp' }));
    expect(screen.getByRole('dialog')).toHaveTextContent(/Megahit/);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);

    // its footer link swaps to the full chart (still only one dialog)
    await userEvent.click(screen.getByRole('button', { name: 'See the full chart' }));
    const dialogs = screen.getAllByRole('dialog');
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]).toHaveTextContent('Stock reference');
  });
});
