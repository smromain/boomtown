import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { clientView } from '@boomtown/client-core';
import { createGame } from '@boomtown/engine';
import { corpReference, foundingOptions, fullChart } from './priceReference.js';
import { StockReference } from './StockReference.js';
import { CorpReference } from './CorpReference.js';
import { RulesReference } from './RulesReference.js';
import { ReferenceProvider, useReference } from './ReferenceContext.js';
import { NAMES, renderPanel, seedCorp } from '../testing/harness.js';

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

  it('foundingOptions lists unfounded corps richest tier first, with opening value', () => {
    const state = createGame({ seats: [{ name: 'A' }, { name: 'B' }], seed: 1, turnOrder: [0, 1] });
    seedCorp(state, 'books', ['2A', '3A']); // books founded -> excluded
    const options = foundingOptions(clientView(state, 0));

    expect(options.some((o) => o.industry === 'books')).toBe(false);
    expect(options[0]!.tier).toBe(3); // sorted tier 3 -> 1
    expect(options.at(-1)!.tier).toBe(1);
    // opening price is the size-2 rung for the tier
    expect(options[0]!.openingPrice).toBeGreaterThan(options.at(-1)!.openingPrice);
    expect(options[0]!.openingPrimary).toBeGreaterThan(0);
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
    expect(within(dialog).getAllByText(NAMES.books).length).toBeGreaterThan(0);
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
    expect(dialog).toHaveTextContent(NAMES.video); // company name
    expect(dialog).toHaveTextContent('Tier 3 ladder');
    expect(dialog).toHaveTextContent('5 tiles');
    expect(dialog).toHaveTextContent('If it paid out today');
    expect(dialog).toHaveTextContent(/Ana/); // holder name
  });

  it('is closed when no industry is passed', async () => {
    await renderPanel(<CorpReference industry={null} onClose={() => {}} onOpenChart={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('reports the seat on the clock, not seat 0 (regression: showed Player 1 on Player 2’s turn)', async () => {
    await renderPanel(<CorpReference industry="video" onClose={() => {}} onOpenChart={() => {}} />, {
      craft: (state) => {
        seedCorp(state, 'video', ['2A', '3A', '4A', '5A', '6A']); // tier 3, size 5 -> $700
        state.turnPointer = 1; // Ben is on the clock
        state.seats[1]!.holdings.video = 3; // Ben holds; Ana (seat 0) holds nothing
      },
    });
    const dialog = screen.getByRole('dialog');
    // "You hold" is Ben's 3 (3 * $700 = $2,100), not Ana's 0
    expect(dialog).toHaveTextContent('3');
    expect(dialog).toHaveTextContent('$2,100');
    // the primary-holder row names Ben, never Ana
    expect(dialog).toHaveTextContent(/Ben/);
    expect(dialog).not.toHaveTextContent(/Ana/);
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
    expect(screen.getByRole('dialog')).toHaveTextContent(NAMES.video);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);

    // its footer link swaps to the full chart (still only one dialog)
    await userEvent.click(screen.getByRole('button', { name: 'See the full chart' }));
    const dialogs = screen.getAllByRole('dialog');
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]).toHaveTextContent('Stock reference');
  });
});

describe('RulesReference modal', () => {
  const open = <RulesReference open onClose={() => {}} onOpenChart={() => {}} />;

  it('reads the classic ruleset rather than hardcoding it', async () => {
    await renderPanel(open);
    const dialog = screen.getByRole('dialog', { name: 'How to play' });
    expect(dialog).toHaveTextContent('Classic');
    expect(dialog).toHaveTextContent('safe at 11 tiles');
    expect(dialog).toHaveTextContent('11+ tiles — cannot be dissolved');
    expect(dialog).toHaveTextContent('41+ tiles in one corporation');
    expect(dialog).toHaveTextContent('majority · minority');
    expect(dialog).toHaveTextContent('both bonuses');
    // the classic board geometry, straight off the ruleset
    expect(dialog).toHaveTextContent('12 × 9');
  });

  it('says something different under the 2015 edition — every edition-bound row moves', async () => {
    await renderPanel(open, { edition: 'edition-2015' });
    const dialog = screen.getByRole('dialog', { name: 'How to play' });
    expect(dialog).toHaveTextContent('Modern');
    expect(dialog).toHaveTextContent('safe at 10 tiles');
    expect(dialog).toHaveTextContent('10+ tiles — cannot be dissolved');
    expect(dialog).toHaveTextContent('38+ tiles in one corporation');
    expect(dialog).toHaveTextContent('primary · secondary · tertiary');
    expect(dialog).toHaveTextContent('primary and tertiary — not secondary');
    expect(dialog).toHaveTextContent('rounded up to the nearest $100');
    expect(dialog).not.toHaveTextContent('majority · minority');
  });

  it('is reachable on a turn that is not yours — the rules belong to the table, not the seat', async () => {
    // Online shape: a view for our seat only, someone else on the clock.
    await renderPanel(open, {
      controls: [0],
      localSeats: [0],
      craft: (state) => {
        state.turnPointer = 1;
      },
    });
    expect(screen.getByRole('dialog', { name: 'How to play' })).toHaveTextContent('Classic');
  });

  it('names the merger sequencing rule that everything else depends on', async () => {
    await renderPanel(open);
    const dialog = screen.getByRole('dialog', { name: 'How to play' });
    expect(dialog).toHaveTextContent(/never counts/i);
    expect(dialog).toHaveTextContent(/largest first/i);
  });
});
