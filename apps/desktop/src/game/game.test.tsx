import { act } from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { INDUSTRIES } from '@boomtown/engine';
import { ActionBar } from './ActionBar.js';
import { BuyModal } from './BuyModal.js';
import { CorporationBand, TrayStrip } from './CorporationBand.js';
import { Shareholders } from './Shareholders.js';
import { StoryCard } from './StoryCard.js';
import { TileRack } from './TileRack.js';
import { TurnHandoff } from './TurnHandoff.js';
import { defaultConfig } from './../setup/gameConfig.js';
import { latestMerger } from './story.js';
import { flush, renderPanel, seedCorp } from '../testing/harness.js';

const humans = (count: number) => ({
  ...defaultConfig(),
  seats: Array.from({ length: count }, (_, i) => ({ name: `P${i}`, kind: 'human' as const, difficulty: 5 })),
});

describe('CorporationBand', () => {
  it('shows a card per active corporation with the derived name', async () => {
    await renderPanel(<CorporationBand />, {
      craft: (state) => {
        seedCorp(state, 'video', ['2E', '3E', '4E', '5E', '6E', '7E', '8E', '9E', '2F', '3F', '4F', '5F']);
        state.corporations.video.eaten = [
          { industry: 'air', displayName: 'Pan-Atlas', flavours: ['the glamour of air travel'] },
        ];
      },
    });

    const band = screen.getByRole('region', { name: 'Corporations' });
    // video ate air -> derived display name, not "Megahit Video"
    const cards = within(band).getAllByRole('article');
    expect(cards[0]).toHaveAttribute('aria-label', expect.stringMatching(/^Megahit/));
    // an unfounded company is not a card in the band
    expect(within(band).queryByText(/Chapter Eleven/)).not.toBeInTheDocument();
  });

  it('says so when nothing is founded yet', async () => {
    await renderPanel(<CorporationBand />);
    expect(screen.getByText(/No corporations founded yet/)).toBeInTheDocument();
  });

  it('widens a card in proportion to how many corporations it contains', async () => {
    await renderPanel(<CorporationBand />, {
      craft: (state) => {
        seedCorp(state, 'video', ['2E', '3E', '4E']);
        seedCorp(state, 'books', ['6E', '7E']);
        state.corporations.video.eaten = [
          { industry: 'air', displayName: 'Pan-Atlas', flavours: [] },
          { industry: 'toys', displayName: 'Toys Я Were', flavours: [] },
        ];
      },
    });
    const cards = within(screen.getByRole('region', { name: 'Corporations' })).getAllByRole('article');
    const grow = (label: string) =>
      Number(getComputedStyle(cards.find((c) => c.getAttribute('aria-label')!.match(label))!).flexGrow);
    expect(grow('^Megahit')).toBe(3); // video + air + toys
    expect(grow('Chapter Eleven')).toBe(1); // books alone
  });
});

describe('TrayStrip', () => {
  it('lists the unfounded companies, and not the founded ones', async () => {
    await renderPanel(<TrayStrip />, {
      craft: (state) => {
        seedCorp(state, 'video', ['2E', '3E', '4E']);
      },
    });
    const tray = screen.getByRole('region', { name: 'In the tray' });
    expect(within(tray).getByText(/Chapter Eleven/)).toBeInTheDocument(); // books, unfounded
    expect(within(tray).queryByText(/Megahit Video/)).not.toBeInTheDocument(); // founded -> not here
  });

  it('renders nothing when every industry is founded', async () => {
    await renderPanel(<TrayStrip />, {
      craft: (state) => {
        INDUSTRIES.forEach((industry, i) => seedCorp(state, industry, [`${i + 1}I`]));
      },
    });
    expect(screen.queryByRole('region', { name: 'In the tray' })).not.toBeInTheDocument();
  });
});

describe('Shareholders', () => {
  it('hides opponent cash under the hidden table setting', async () => {
    await renderPanel(<Shareholders />, { visibility: 'hidden' });
    const rows = screen.getByRole('region', { name: 'Shareholders' });
    expect(within(rows).getByText('$6,000')).toBeInTheDocument(); // own seat
    expect(within(rows).getAllByText('—').length).toBeGreaterThan(0); // opponents
  });

  it('shows every seat cash under the open setting', async () => {
    await renderPanel(<Shareholders />, { visibility: 'open' });
    expect(screen.getAllByText('$6,000')).toHaveLength(3);
  });
});

describe('TileRack', () => {
  it('labels each tile with its effect and disables the unplayable ones', async () => {
    await renderPanel(<TileRack />, {
      craft: (state) => {
        seedCorp(state, 'video', Array.from({ length: 11 }, (_, i) => `${i + 1}A`));
        seedCorp(state, 'books', Array.from({ length: 11 }, (_, i) => `${i + 1}C`));
        state.hands[0] = ['2B', '6E']; // 2B merges two safe corps -> dead
      },
    });
    const dead = screen.getByRole('button', { name: /2B/ });
    expect(dead).toHaveAttribute('data-effect', 'dead');
    expect(dead).toBeDisabled();
    expect(screen.getByRole('button', { name: /6E/ })).toBeEnabled();
  });
});

describe('StoryCard', () => {
  it('narrates a completed merger — headline and the renamed survivor', async () => {
    const { client } = await renderPanel(<StoryCard />, {
      craft: (state) => {
        seedCorp(state, 'video', ['2E', '3E', '4E']); // larger -> survives
        seedCorp(state, 'books', ['6E', '7E']); // nobody holds it, so it resolves in one step
        state.hands[0] = ['5E'];
      },
    });
    await act(async () => {
      client.dispatch({ type: 'place-tile', seat: 0, tile: '5E' });
      await flush();
    });

    const story = screen.getByRole('region', { name: 'Story' });
    expect(within(story).getByText(/Chapter Eleven \+ Megahit Video merge at 5E/)).toBeInTheDocument();
    // survivor renamed — "Megahit Video" with its space is gone, replaced by the derived stem+fragment
    expect(within(story).getAllByText(/Megahitvi/).length).toBeGreaterThan(0);
    expect(within(story).queryByText('Megahit Video', { exact: true })).not.toBeInTheDocument();
  });

  it('spells out the merger sentence while it is unresolved', async () => {
    const { client } = await renderPanel(<StoryCard />, {
      craft: (state) => {
        seedCorp(state, 'video', ['2E', '3E', '4E']); // 3 -> survives
        seedCorp(state, 'books', ['6E', '7E']); // 2 -> defunct
        state.seats[0]!.holdings.books = 1; // a holder, so the merger pauses for disposal
        state.hands[0] = ['5E'];
      },
    });
    await act(async () => {
      client.dispatch({ type: 'place-tile', seat: 0, tile: '5E' });
      await flush();
    });

    const story = screen.getByRole('region', { name: 'Story' });
    expect(within(story).getByText(/folds Chapter Eleven into Megahit Video/)).toBeInTheDocument();
    expect(
      within(story).getByText(/Megahit Video is larger at 3 tiles, so Chapter Eleven is dissolved at 2/),
    ).toBeInTheDocument();
  });

  it('falls back to the recent log when there is no merger', async () => {
    await renderPanel(<StoryCard />);
    expect(screen.getByText(/No moves yet/)).toBeInTheDocument();
  });
});

describe('latestMerger', () => {
  it('is null with no merger in the log', () => {
    expect(latestMerger([{ type: 'turn-advanced', seat: 1 }])).toBeNull();
  });

  it('reads survivor and defunct from a completed span', () => {
    const story = latestMerger([
      { type: 'merger-started', placedTile: '5E', corporations: ['books', 'video'] },
      { type: 'survivor-chosen', survivor: 'video' },
      { type: 'corporation-defunct', industry: 'books', absorbedInto: 'video' },
      { type: 'merger-completed', survivor: 'video' },
    ]);
    expect(story).toMatchObject({ placedTile: '5E', survivor: 'video', defunct: ['books'], complete: true });
  });
});

describe('TurnHandoff (hot-seat turn boundary)', () => {
  it('does not block the opening player', async () => {
    await renderPanel(<TurnHandoff config={humans(3)} />);
    expect(screen.queryByRole('dialog', { name: 'Turn handoff' })).not.toBeInTheDocument();
  });

  it('blocks the screen when the turn passes to another human, until they confirm', async () => {
    const { client } = await renderPanel(<TurnHandoff config={humans(3)} />);
    // seat 0 plays a full turn -> turn passes to seat 1
    const tile = client.store.getState().views[0]!.handTiles[0]!.tile;
    await act(async () => {
      client.dispatch({ type: 'place-tile', seat: 0, tile });
      await flush();
      client.dispatch({ type: 'buy-shares', seat: 0, picks: {} });
      await flush();
    });

    const dialog = screen.getByRole('dialog', { name: 'Turn handoff' });
    expect(within(dialog).getByRole('heading', { name: 'Ben' })).toBeInTheDocument(); // seat 1's name

    await act(async () => {
      await userEvent.click(within(dialog).getByRole('button', { name: /show my turn/ }));
    });
    expect(screen.queryByRole('dialog', { name: 'Turn handoff' })).not.toBeInTheDocument();
  });
});

describe('BuyModal', () => {
  it('opens on the buy step with the buy controls inside', async () => {
    await renderPanel(<BuyModal />, {
      craft: (state) => {
        seedCorp(state, 'video', ['5H', '5I', '4I']);
        state.step = 'buy';
        state.hands[0] = [];
      },
    });
    const dialog = screen.getByRole('dialog', { name: 'Buy stock' });
    expect(within(dialog).getByRole('button', { name: 'more video' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Buy nothing/ })).toBeInTheDocument();
  });

  it('stays closed outside the buy step', async () => {
    await renderPanel(<BuyModal />, {
      craft: (state) => {
        state.step = 'place';
      },
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('ActionBar', () => {
  it('offers the end-of-game choice at the end-check step', async () => {
    const rowA = Array.from({ length: 11 }, (_, i) => `${i + 1}A`);
    await renderPanel(<ActionBar />, {
      craft: (state) => {
        seedCorp(state, 'video', rowA); // safe, only corp -> end condition holds
        state.step = 'end-check';
      },
    });
    expect(screen.getByRole('button', { name: 'End the game' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep playing' })).toBeInTheDocument();
  });

  it('offers a skip when no hand tile is playable', async () => {
    const rowA = Array.from({ length: 11 }, (_, i) => `${i + 1}A`);
    const rowC = Array.from({ length: 11 }, (_, i) => `${i + 1}C`);
    await renderPanel(<ActionBar />, {
      craft: (state) => {
        seedCorp(state, 'video', rowA);
        seedCorp(state, 'books', rowC);
        state.hands[0] = ['1B']; // between two safe corps -> dead, unplayable
        state.bag = [];
      },
    });
    expect(screen.getByRole('button', { name: 'Skip placement' })).toBeInTheDocument();
  });
});
