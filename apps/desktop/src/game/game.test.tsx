import { act } from 'react';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CorporationBand } from './CorporationBand.js';
import { Shareholders } from './Shareholders.js';
import { StoryCard } from './StoryCard.js';
import { TileRack } from './TileRack.js';
import { latestMerger } from './story.js';
import { flush, renderPanel, seedCorp } from '../testing/harness.js';

describe('CorporationBand', () => {
  it('shows a card per active corporation with the derived name; unfounded ones sit in the tray', async () => {
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
    expect(within(band).getByText(/Chapter Eleven/)).toBeInTheDocument(); // books, in the tray
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
