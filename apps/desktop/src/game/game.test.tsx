import { act } from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { INDUSTRIES } from '@boomtown/engine';
import { ActionBar } from './ActionBar.js';
import { OutOfPlay } from './OutOfPlay.js';
import { TurnModal } from './TurnModal.js';
import { CorporationBand, TrayStrip } from './CorporationBand.js';
import { Shareholders } from './Shareholders.js';
import { StoryCard } from './StoryCard.js';
import { TileRack } from './TileRack.js';
import { TurnHandoff } from './TurnHandoff.js';
import { DecisionModal } from '../decisions/DecisionModal.js';
import { defaultConfig } from './../setup/gameConfig.js';
import { latestMerger } from './story.js';
import { NAMES, flush, mergedName, renderPanel, seedCorp } from '../testing/harness.js';

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
          { industry: 'air', displayName: NAMES.air, flavours: ['the glamour of air travel'] },
        ];
      },
    });

    const band = screen.getByRole('region', { name: 'Corporations' });
    // video ate air -> derived display name, not the plain base name; the card is
    // a button that opens the stock reference
    const cards = within(band).getAllByRole('button');
    expect(cards[0]).toHaveAttribute('aria-label', `${mergedName('video', 'air')} — stock reference`);
    expect(cards[0]!.getAttribute('aria-label')).not.toContain(NAMES.video);
    // an unfounded company is not a card in the band
    expect(within(band).queryByText(/Chapter Eleven/)).not.toBeInTheDocument();
  });

  it('says so when nothing is founded yet, with the R13 skyline illustration', async () => {
    const { container } = await renderPanel(<CorporationBand />);
    expect(screen.getByText(/No corporations founded yet/)).toBeInTheDocument();
    expect(container.querySelector('svg[role="presentation"]')).toBeTruthy();
  });

  it('widens a card in proportion to how many corporations it contains', async () => {
    await renderPanel(<CorporationBand />, {
      craft: (state) => {
        seedCorp(state, 'video', ['2E', '3E', '4E']);
        seedCorp(state, 'books', ['6E', '7E']);
        state.corporations.video.eaten = [
          { industry: 'air', displayName: NAMES.air, flavours: [] },
          { industry: 'toys', displayName: NAMES.toys, flavours: [] },
        ];
      },
    });
    const cards = within(screen.getByRole('region', { name: 'Corporations' })).getAllByRole('button');
    const grow = (label: string) =>
      Number(getComputedStyle(cards.find((c) => c.getAttribute('aria-label')!.includes(label))!).flexGrow);
    expect(grow(mergedName('video', 'air', 'toys'))).toBe(3); // video + air + toys
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
    expect(within(tray).queryByText(NAMES.video)).not.toBeInTheDocument(); // founded -> not here
  });

  it('shows the "every corporation is founded" empty state (R13/U13), not nothing, once the tray is empty', async () => {
    const { container } = await renderPanel(<TrayStrip />, {
      craft: (state) => {
        INDUSTRIES.forEach((industry, i) => seedCorp(state, industry, [`${i + 1}I`]));
      },
    });
    const tray = screen.getByRole('region', { name: 'In the tray' });
    expect(tray).toHaveTextContent(/Every corporation is founded/);
    expect(container.querySelector('svg[role="presentation"]')).toBeTruthy();
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
    // `classic`: the default preset forces the books closed, so an open table
    // only exists on a ruleset that leaves visibility to the table.
    await renderPanel(<Shareholders />, { visibility: 'open', edition: 'classic' });
    expect(screen.getAllByText('$6,000')).toHaveLength(3);
  });

  // Regression: an all-bot table disclosed everybody's books. A hot-seat client
  // holds a view for every seat, and this panel read the seat *on the clock* —
  // so each bot's own cash and holdings rendered as its turn came round, and one
  // turn cycle showed the watcher the whole table. Under Boomtown that is the
  // mechanic leaking, not a cosmetic slip.
  it('shows a watcher nothing private at an all-bot table, whichever bot is on the clock', async () => {
    const { client } = await renderPanel(<Shareholders />, {
      edition: 'boomtown',
      localSeats: [], // nobody at this screen owns a seat
      craft: (state) => {
        state.seats[1]!.cash = 1234;
        state.seats[1]!.holdings.books = 4;
        state.turnPointer = 1; // a bot is on the clock
      },
    });
    const rows = screen.getByRole('region', { name: 'Shareholders' });

    // names are public and still render; nothing else does
    expect(within(rows).getByText(/Ben/)).toBeInTheDocument();
    expect(rows.textContent).not.toMatch(/\$\d/);
    expect(within(rows).getAllByText('—')).toHaveLength(6); // cash + holdings, three seats

    // and it stays that way as the clock moves round the table
    await act(async () => {
      client.dispatch({ type: 'end-turn', seat: 1 });
      await flush();
    });
    expect(screen.getByRole('region', { name: 'Shareholders' }).textContent).not.toMatch(/\$\d/);
  });

  it('still shows a seated player their own books', async () => {
    await renderPanel(<Shareholders />, { edition: 'boomtown', localSeats: [0] });
    const rows = screen.getByRole('region', { name: 'Shareholders' });
    expect(within(rows).getByText('$6,000')).toBeInTheDocument();
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

  it('renders nothing when the active seat is not a local seat', async () => {
    await renderPanel(<TileRack />, {
      localSeats: [0],
      craft: (state) => {
        state.turnPointer = 1; // a bot / remote seat
      },
    });
    expect(screen.queryByRole('region', { name: 'Your tiles' })).not.toBeInTheDocument();
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
    expect(
      within(story).getByText(new RegExp(`Chapter Eleven \\+ ${NAMES.video} merge at 5E`)),
    ).toBeInTheDocument();
    // survivor renamed — the base name is gone, replaced by the derived stem+fragment
    expect(within(story).getAllByText(new RegExp(mergedName('video', 'books'))).length).toBeGreaterThan(0);
    expect(within(story).queryByText(NAMES.video, { exact: true })).not.toBeInTheDocument();
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
    expect(
      within(story).getByText(new RegExp(`folds Chapter Eleven into ${NAMES.video}`)),
    ).toBeInTheDocument();
    expect(
      within(story).getByText(
        new RegExp(`${NAMES.video} is larger at 3 tiles, so Chapter Eleven is dissolved at 2`),
      ),
    ).toBeInTheDocument();
  });

  it('labels bonus tiers majority/minority under the classic ruleset, never tertiary', async () => {
    const { client } = await renderPanel(<StoryCard />, {
      craft: (state) => {
        seedCorp(state, 'video', ['2E', '3E', '4E']); // survives
        seedCorp(state, 'books', ['6E', '7E']); // defunct, two holder groups
        state.seats[0]!.holdings.books = 3; // top holder
        state.seats[1]!.holdings.books = 1; // second holder
        state.hands[0] = ['5E'];
      },
    });
    await act(async () => {
      client.dispatch({ type: 'place-tile', seat: 0, tile: '5E' });
      await flush();
    });

    const story = screen.getByRole('region', { name: 'Story' });
    expect(within(story).getByText(/majority/)).toBeInTheDocument();
    expect(within(story).getByText(/minority/)).toBeInTheDocument();
    expect(within(story).queryByText(/primary|secondary|tertiary/)).not.toBeInTheDocument();
  });

  it('falls back to the recent log when there is no merger, with the R13 skyline illustration', async () => {
    const { container } = await renderPanel(<StoryCard />);
    expect(screen.getByText(/No moves yet/)).toBeInTheDocument();
    expect(container.querySelector('svg[role="presentation"]')).toBeTruthy();
  });

  it('the recent-events log uses company and player names, never industry keys', async () => {
    const { client } = await renderPanel(<StoryCard />, {
      craft: (state) => {
        // one empty neighbour so placing 6E founds a corporation
        state.cells['6F'] = { kind: 'unincorporated' };
        state.hands[0] = ['6E'];
      },
    });
    await act(async () => {
      client.dispatch({ type: 'place-tile', seat: 0, tile: '6E' });
      await flush();
      client.dispatch({ type: 'found-corporation', seat: 0, industry: 'video', hqTile: '6E' });
      await flush();
    });

    const story = screen.getByRole('region', { name: 'Story' });
    expect(within(story).getByText(new RegExp(`${NAMES.video} founded at 6E`))).toBeInTheDocument();
    expect(within(story).getByText(/^Ana placed 6E/)).toBeInTheDocument();
    // never the raw key or "Seat 0"
    expect(within(story).queryByText(/\bvideo founded\b/)).not.toBeInTheDocument();
    expect(within(story).queryByText(/^Seat 0 placed/)).not.toBeInTheDocument();
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

  it('does not render its own overlay while a decision modal is open', async () => {
    // regression: TurnHandoff used to sit opaque + inert (outside the Radix
    // portal) over a merger prompt. The DecisionModal now owns the hand-off.
    const { client } = await renderPanel(
      <>
        <DecisionModal />
        <TurnHandoff config={humans(3)} />
      </>,
      {
        craft: (state) => {
          seedCorp(state, 'video', ['2E', '3E', '4E']);
          seedCorp(state, 'books', ['6E', '7E']);
          state.seats[2]!.holdings.books = 3; // Cy (not the mergemaker) must dispose
          state.hands[0] = ['5E'];
        },
      },
    );
    await act(async () => {
      client.dispatch({ type: 'place-tile', seat: 0, tile: '5E' });
      await flush();
    });
    expect(document.querySelector('[aria-label="Turn handoff"]')).toBeNull();
  });

  it('does still hand off for a plain turn pass after a merger completes', async () => {
    const { client } = await renderPanel(
      <>
        <DecisionModal />
        <TurnHandoff config={humans(3)} />
      </>,
      {
        craft: (state) => {
          seedCorp(state, 'video', ['3E', '4E']); // 2, tied
          seedCorp(state, 'books', ['6E', '7E']); // 2, tied
          state.hands[0] = ['5E'];
        },
      },
    );
    await act(async () => {
      client.dispatch({ type: 'place-tile', seat: 0, tile: '5E' }); // size tie -> survivor prompt for seat 0
      await flush();
    });
    // seat 0's own decision — handoff hidden, prompt shown
    expect(screen.queryByRole('dialog', { name: 'Turn handoff' })).not.toBeInTheDocument();
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: new RegExp(NAMES.video) }));
      await flush();
      client.dispatch({ type: 'buy-shares', seat: 0, picks: {} });
      await flush();
    });
    // now the turn passes to Ben -> handoff appears
    expect(screen.getByRole('dialog', { name: 'Turn handoff' })).toHaveTextContent('Ben');
  });

  it('hands the machine back to the mergemaker for the buy step (regression: disposer bought)', async () => {
    const { client } = await renderPanel(
      <>
        <DecisionModal />
        <TurnModal />
        <TurnHandoff config={humans(3)} />
      </>,
      {
        craft: (state) => {
          seedCorp(state, 'video', ['2E', '3E', '4E']); // survives
          seedCorp(state, 'books', ['6E', '7E']); // defunct
          state.seats[2]!.holdings.books = 4; // Cy (seat 2) disposes; mergemaker is seat 0
          state.hands[0] = ['5E'];
        },
      },
    );
    // Ana (seat 0) is the mergemaker and holds the machine. She places the tile.
    await act(async () => {
      client.dispatch({ type: 'place-tile', seat: 0, tile: '5E' });
      await flush();
    });
    // hand to Cy for the disposal, Cy confirms it
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /show my decision/ }));
      await flush();
    });
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      await flush();
    });

    // merger done -> buy step, active seat is the mergemaker (0)
    expect(client.store.getState().views[0]!.step).toBe('buy');
    // the machine is still with Cy -> hand it back to Ana before the buy is actionable
    const handback = screen.getByRole('dialog', { name: 'Turn handoff' });
    expect(handback).toHaveTextContent('Ana');
    // the buy controls are not reachable until Ana takes the machine
    expect(screen.queryByRole('button', { name: /Buy nothing/ })).not.toBeInTheDocument();

    await act(async () => {
      await userEvent.click(within(handback).getByRole('button', { name: /show my turn/ }));
      await flush();
    });
    // now Ana's buy
    expect(screen.getByRole('dialog', { name: 'Buy stock' })).toBeInTheDocument();
  });
});

describe('TurnModal', () => {
  it('opens on the buy step with the buy controls inside', async () => {
    await renderPanel(<TurnModal />, {
      craft: (state) => {
        seedCorp(state, 'video', ['5H', '5I', '4I']);
        state.step = 'buy';
        state.hands[0] = [];
      },
    });
    const dialog = screen.getByRole('dialog', { name: 'Buy stock' });
    // the row is labelled by the company name, not the industry key
    expect(within(dialog).getByRole('button', { name: `one more ${NAMES.video} share` })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /video/ })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Buy nothing/ })).toBeInTheDocument();
  });

  it('stays closed outside the buy step', async () => {
    await renderPanel(<TurnModal />, {
      craft: (state) => {
        state.step = 'place';
      },
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('stays closed on a bot / remote seat buy step — the modal is not the human\'s', async () => {
    await renderPanel(<TurnModal />, {
      localSeats: [0], // seats 1 & 2 are not local
      craft: (state) => {
        seedCorp(state, 'video', ['5H', '5I', '4I']);
        state.turnPointer = 1;
        state.step = 'buy';
      },
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('minimizes to a pill and restores', async () => {
    await renderPanel(<TurnModal />, {
      craft: (state) => {
        seedCorp(state, 'video', ['5H', '5I', '4I']);
        state.step = 'buy';
        state.hands[0] = [];
      },
    });

    await userEvent.click(screen.getByRole('button', { name: /Peek at the board/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Resume buying stock/ }));
    const dialog = screen.getByRole('dialog', { name: 'Buy stock' });
    expect(within(dialog).getByRole('button', { name: /Buy nothing/ })).toBeInTheDocument();
  });
});

describe('OutOfPlay', () => {
  it('shows nothing until a tile is removed', async () => {
    await renderPanel(<OutOfPlay />);
    expect(screen.queryByRole('region', { name: 'Out of play' })).not.toBeInTheDocument();
  });

  it('lists the removed tiles once the sweep has run', async () => {
    // two safe corps + a dead tile in hand; finishing the turn sweeps it
    const { client } = await renderPanel(<OutOfPlay />, {
      craft: (state) => {
        seedCorp(state, 'video', Array.from({ length: 11 }, (_, i) => `${i + 1}A`));
        seedCorp(state, 'books', Array.from({ length: 11 }, (_, i) => `${i + 1}C`));
        state.hands[0] = ['1B', '6E'];
      },
    });
    await act(async () => {
      client.dispatch({ type: 'place-tile', seat: 0, tile: '6E' });
      await flush();
      client.dispatch({ type: 'buy-shares', seat: 0, picks: {} });
      await flush();
    });
    const region = screen.getByRole('region', { name: 'Out of play' });
    expect(within(region).getByText('1B')).toBeInTheDocument();
  });
});

describe('ActionBar', () => {
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

  it('renders nothing when the seat on the clock is not a local seat (a bot / remote turn)', async () => {
    const rowA = Array.from({ length: 11 }, (_, i) => `${i + 1}A`);
    const rowC = Array.from({ length: 11 }, (_, i) => `${i + 1}C`);
    await renderPanel(<ActionBar />, {
      localSeats: [0, 1], // seat 2 is a bot
      craft: (state) => {
        seedCorp(state, 'video', rowA);
        seedCorp(state, 'books', rowC);
        state.hands[2] = ['1B']; // dead tile: the bot cannot place
        state.turnPointer = 2; // bot on the clock
      },
    });
    // the bug: the watching human saw (and could click) the bot's own action
    expect(screen.queryByRole('button', { name: 'Skip placement' })).not.toBeInTheDocument();
  });
});

describe('TurnModal at the end-check step', () => {
  it('offers the end-of-game choice, where the turn is actually waiting', async () => {
    // Regression: this lived in a card at the foot of the right rail, below the
    // fold. The buy modal would close onto a turn that looked stuck because the
    // only way forward was off screen.
    const rowA = Array.from({ length: 11 }, (_, i) => `${i + 1}A`);
    await renderPanel(<TurnModal />, {
      craft: (state) => {
        seedCorp(state, 'video', rowA); // safe, only corp -> end condition holds
        state.step = 'end-check';
      },
    });
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: /End the game/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Keep playing/ })).toBeInTheDocument();
  });

  it('stays open across the buy step and the end-check that follows it', async () => {
    const rowA = Array.from({ length: 11 }, (_, i) => `${i + 1}A`);
    const { client } = await renderPanel(<TurnModal />, {
      craft: (state) => {
        seedCorp(state, 'video', rowA);
        state.step = 'buy';
      },
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await act(async () => {
      client.dispatch({ type: 'buy-shares', seat: 0, picks: {} });
      await flush();
    });
    // Same dialog, new content — never a frame with the board and no prompt.
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: /End the game/ })).toBeInTheDocument();
  });
});
