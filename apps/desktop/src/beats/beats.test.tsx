import { act } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerView } from '@boomtown/engine';
import { createGame } from '@boomtown/engine';
import { triggerFor } from './beatTriggers.js';
import { EMPTY_BEAT_QUEUE, advance, enqueue, type BeatQueue } from './beatQueue.js';
import { BeatOrchestrator } from './BeatOrchestrator.js';
import { BeatProvider } from './BeatContext.js';
import { GameClientProvider } from '../client/GameClientProvider.js';
import { TurnHandoff } from '../game/TurnHandoff.js';
import { DecisionModal } from '../decisions/DecisionModal.js';
import { defaultConfig } from '../setup/gameConfig.js';
import { flush, mergedName, NAMES, renderPanel, seedCorp } from '../testing/harness.js';

const humans = (count: number) => ({
  ...defaultConfig(),
  seats: Array.from({ length: count }, (_, i) => ({ name: `P${i}`, kind: 'human' as const, difficulty: 5 })),
});

vi.mock('../audio/soundManager.js', () => ({ soundManager: { play: vi.fn(), isMuted: () => false, setMuted: vi.fn() } }));
const { soundManager } = await import('../audio/soundManager.js');

afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

function view(): PlayerView {
  const state = createGame({ seats: [{ name: 'A' }, { name: 'B' }], seed: 1, turnOrder: [0, 1] });
  state.cells['5E'] = { kind: 'corporation', industry: 'video' }; // one tile on the board
  return { ...({} as PlayerView), cells: state.cells } as PlayerView;
}

describe('beatTriggers.triggerFor (pure)', () => {
  it('resolves the first-tile beat only when the view shows exactly one tile', () => {
    const oneTile = view();
    expect(triggerFor({ type: 'tile-placed', seat: 0, tile: '5E', outcome: 'nothing' }, oneTile)).toEqual({
      id: 'first-tile',
    });
    const twoTiles = { ...oneTile, cells: { ...oneTile.cells, '6E': { kind: 'corporation', industry: 'video' } } } as PlayerView;
    expect(triggerFor({ type: 'tile-placed', seat: 0, tile: '6E', outcome: 'nothing' }, twoTiles)).toBeNull();
  });

  it('resolves the founding beat for corporation-founded', () => {
    const beat = triggerFor(
      { type: 'corporation-founded', industry: 'video', hqTile: '5E', tiles: ['5E'], founderBonusPaid: true },
      view(),
    );
    expect(beat).toEqual({ id: 'founding', industry: 'video' });
  });

  it('a non-beat event (tiles-drawn) resolves nothing', () => {
    expect(triggerFor({ type: 'tiles-drawn', seat: 0, count: 1 }, view())).toBeNull();
  });

  it('resolves the buy-stock beat only when cost > 0', () => {
    const bought = triggerFor({ type: 'shares-bought', seat: 0, picks: { video: 2 }, cost: 500 }, view());
    expect(bought).toEqual({ id: 'buy-stock', seat: 0, cost: 500, picks: { video: 2 } });
    expect(triggerFor({ type: 'shares-bought', seat: 0, picks: {}, cost: 0 }, view())).toBeNull();
  });

  it('resolves the merger beat on merger-completed, not merger-started', () => {
    expect(
      triggerFor({ type: 'merger-started', placedTile: '5E', corporations: ['video', 'books'] }, view()),
    ).toBeNull();
    expect(triggerFor({ type: 'merger-completed', survivor: 'video' }, view())).toEqual({ id: 'merger' });
  });

  it('resolves endgame and victory', () => {
    expect(triggerFor({ type: 'end-announced', seat: 1 }, view())).toEqual({ id: 'endgame', seat: 1 });
    expect(
      triggerFor({ type: 'game-over', result: { rankings: [], winners: [] } }, view()),
    ).toEqual({ id: 'victory' });
  });
});

describe('beatQueue (pure)', () => {
  it('the first beat becomes active immediately', () => {
    const q = enqueue(EMPTY_BEAT_QUEUE, { id: 'first-tile' });
    expect(q).toEqual({ active: { id: 'first-tile' }, pending: [] });
  });

  it('queues behind an active beat, then collapses to the latest past the bound', () => {
    let q: BeatQueue = { active: { id: 'endgame', seat: 0 }, pending: [] };
    q = enqueue(q, { id: 'founding', industry: 'books' });
    q = enqueue(q, { id: 'founding', industry: 'air' });
    q = enqueue(q, { id: 'founding', industry: 'energy' });
    q = enqueue(q, { id: 'founding', industry: 'tech' }); // 4th pending -> collapses
    expect(q.pending).toEqual([{ id: 'founding', industry: 'tech' }]);
  });

  it('a merger beat in the backlog survives a collapse; lesser beats are dropped instead', () => {
    let q: BeatQueue = { active: { id: 'endgame', seat: 0 }, pending: [] };
    q = enqueue(q, { id: 'founding', industry: 'books' });
    q = enqueue(q, { id: 'merger' });
    q = enqueue(q, { id: 'founding', industry: 'air' });
    q = enqueue(q, { id: 'founding', industry: 'energy' }); // collapses, but keeps the merger
    expect(q.pending).toEqual([{ id: 'merger' }, { id: 'founding', industry: 'energy' }]);
  });

  it('advance promotes the next pending beat', () => {
    let q: BeatQueue = { active: { id: 'victory' }, pending: [{ id: 'endgame', seat: 0 }] };
    q = advance(q);
    expect(q).toEqual({ active: { id: 'endgame', seat: 0 }, pending: [] });
    expect(advance(q)).toEqual({ active: null, pending: [] });
  });
});

describe('BeatOrchestrator (component, real dispatch)', () => {
  it('the founding beat renders for a live founding, plays sound, and dismisses on Escape', async () => {
    const { client } = await renderPanel(
      <BeatProvider>
        <BeatOrchestrator />
      </BeatProvider>,
      {
      craft: (state) => {
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

    const beat = await screen.findByRole('dialog', { name: 'A corporation is founded' });
    expect(beat).toHaveTextContent(NAMES.video);
    expect(soundManager.play).toHaveBeenCalledWith('founding');

    await act(async () => {
      await userEvent.keyboard('{Escape}');
    });
    expect(screen.queryByRole('dialog', { name: 'A corporation is founded' })).not.toBeInTheDocument();
  });

  it('still renders its still-frame, still plays sound, and is still dismissible under prefers-reduced-motion (U12, AE4)', async () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    try {
      const { client } = await renderPanel(
      <BeatProvider>
        <BeatOrchestrator />
      </BeatProvider>,
      {
        craft: (state) => {
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

      const beat = await screen.findByRole('dialog', { name: 'A corporation is founded' });
      expect(beat).toHaveTextContent(NAMES.video);
      expect(soundManager.play).toHaveBeenCalledWith('founding');

      await act(async () => {
        await userEvent.keyboard('{Enter}');
      });
      expect(screen.queryByRole('dialog', { name: 'A corporation is founded' })).not.toBeInTheDocument();
    } finally {
      window.matchMedia = original;
    }
  });

  it('events already in the log at mount play no beat; the next live event does (AE8)', async () => {
    const { client } = await renderPanel(<div />, {
      craft: (state) => {
        state.cells['6F'] = { kind: 'unincorporated' };
        state.hands[0] = ['6E'];
        state.hands[1] = ['9A'];
      },
      localSeats: [0, 1],
    });

    // A founding happens *before* the orchestrator ever mounts.
    await act(async () => {
      client.dispatch({ type: 'place-tile', seat: 0, tile: '6E' });
      await flush();
      client.dispatch({ type: 'found-corporation', seat: 0, industry: 'video', hqTile: '6E' });
      await flush();
    });
    expect(client.store.getState().log.some((e) => e.type === 'corporation-founded')).toBe(true);

    // Now mount the orchestrator on the same client/log.
    render(
      <GameClientProvider client={client} localSeats={[0, 1]}>
        <BeatProvider>
          <BeatOrchestrator />
        </BeatProvider>
      </GameClientProvider>,
    );
    await flush();
    expect(screen.queryByRole('dialog', { name: 'A corporation is founded' })).not.toBeInTheDocument();

    // A live event past the hydration mark still fires.
    await act(async () => {
      client.dispatch({ type: 'buy-shares', seat: 0, picks: { video: 1 } });
      await flush();
    });
    await screen.findByRole('status', { name: /bought stock/ });
  });

  it('the merger beat renders the accreted survivor after a real merger resolves', async () => {
    const { client } = await renderPanel(
      <BeatProvider>
        <BeatOrchestrator />
      </BeatProvider>,
      {
      craft: (state) => {
        seedCorp(state, 'video', ['2E', '3E', '4E']); // survives (larger)
        seedCorp(state, 'books', ['6E', '7E']); // defunct, nobody holds it
        state.hands[0] = ['5E'];
      },
    });

    await act(async () => {
      client.dispatch({ type: 'place-tile', seat: 0, tile: '5E' });
      await flush();
    });

    // Stage 1 (collide): the two pre-merge names lean in; the accreted
    // headline exists in the DOM already (React renders every stage's markup
    // throughout) but is suppressed to invisible via inline style.
    const beat = await screen.findByRole('dialog', { name: 'Merger' });
    expect(beat).toHaveTextContent(NAMES.video);
    expect(beat).toHaveTextContent(NAMES.books);
    const headline = within(beat).getByText(mergedName('video', 'books'));
    expect(headline).toHaveStyle({ opacity: '0' });

    // A click advances one stage at a time (collide -> blend -> name), at
    // which point the accreted name becomes the visible headline.
    await act(async () => {
      await userEvent.click(beat);
    });
    await act(async () => {
      await userEvent.click(beat);
    });
    expect(headline).toHaveStyle({ opacity: '1' });
  });

  it('a buy-stock flourish auto-dismisses without blocking play (does not require a key/click)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { client } = await renderPanel(
      <BeatProvider>
        <BeatOrchestrator />
      </BeatProvider>,
      {
        craft: (state) => {
          state.hands[0] = ['5E'];
        },
      });
      await act(async () => {
        client.dispatch({ type: 'buy-shares', seat: 0, picks: {} });
        await flush();
      });
      // cost 0 (nothing bought) -> no beat at all
      expect(screen.queryByRole('status', { name: /bought stock/ })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders nothing (and plays no sound) while a decision prompt owns the screen', async () => {
    const { client } = await renderPanel(
      <BeatProvider>
        <BeatOrchestrator />
      </BeatProvider>,
      {
      craft: (state) => {
        seedCorp(state, 'video', ['3E', '4E']); // tied size -> survivor prompt
        seedCorp(state, 'books', ['6E', '7E']);
        state.hands[0] = ['5E'];
      },
    });
    await act(async () => {
      client.dispatch({ type: 'place-tile', seat: 0, tile: '5E' });
      await flush();
    });
    // merger-completed has not landed yet (a decision is pending) -> no beat
    expect(screen.queryByRole('dialog', { name: 'Merger' })).not.toBeInTheDocument();
  });
});

describe('TurnHandoff defers to an active beat (regression)', () => {
  it('does not cover the merger beat with the hot-seat hand-off card; the hand-off appears once the beat is dismissed', async () => {
    // The exact shape that triggered the bug: seat 2 (not the mergemaker) must
    // dispose, so the machine ends up with seat 2 when merger-completed lands
    // and control returns to the mergemaker (seat 0) for the buy step —
    // TurnHandoff and the merger beat both want the screen at the same time.
    const { client } = await renderPanel(
      <BeatProvider>
        <DecisionModal />
        <TurnHandoff config={humans(3)} />
        <BeatOrchestrator />
      </BeatProvider>,
      {
        craft: (state) => {
          seedCorp(state, 'video', ['2E', '3E', '4E']); // survives
          seedCorp(state, 'books', ['6E', '7E']); // defunct
          state.seats[2]!.holdings.books = 4; // seat 2 disposes; mergemaker is seat 0
          state.hands[0] = ['5E'];
        },
      },
    );

    await act(async () => {
      client.dispatch({ type: 'place-tile', seat: 0, tile: '5E' });
      await flush();
    });
    // hand to seat 2 for the disposal, they confirm and dispose
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /show my decision/ }));
      await flush();
    });
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      await flush();
    });

    // merger-completed has landed; the machine is still with seat 2, not the
    // mergemaker (seat 0) — the old bug: TurnHandoff (opaque, higher z-index)
    // rendered right on top of the beat and hid its entire animation.
    const beat = await screen.findByRole('dialog', { name: 'Merger' });
    expect(beat).toHaveTextContent(NAMES.video);
    expect(screen.queryByRole('dialog', { name: 'Turn handoff' })).not.toBeInTheDocument();

    // dismissing the beat is what lets the hand-off finally appear
    await act(async () => {
      await userEvent.keyboard('{Escape}');
    });
    expect(screen.queryByRole('dialog', { name: 'Merger' })).not.toBeInTheDocument();
    const handoff = screen.getByRole('dialog', { name: 'Turn handoff' });
    expect(handoff).toHaveTextContent('Ana'); // hand back to the mergemaker (harness seat 0)
  });
});
