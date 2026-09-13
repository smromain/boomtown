import { act } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BeatProvider } from './BeatContext.js';
import { stagesFor } from './beats/MergerBeat.js';
import { BeatOrchestrator } from './BeatOrchestrator.js';
import { DebugBeatPreview } from './debug/DebugBeatPreview.js';
import { DecisionModal } from '../decisions/DecisionModal.js';
import { soundManager } from '../audio/soundManager.js';
import type { GameState } from '@boomtown/engine';
import { flush, renderPanel, seedCorp } from '../testing/harness.js';

vi.mock('../audio/soundManager.js', () => ({
  soundManager: { play: vi.fn(), isMuted: () => false, setMuted: vi.fn() },
}));

/**
 * video 4 · books 3 · air 3, all meeting at 5F. Two defunct chains, tied for
 * largest, so the mergemaker also orders them — the fullest shape a merger
 * takes short of a four-way.
 */
const threeWay = {
  edition: 'classic' as const,
  visibility: 'open' as const,
  craft: (state: GameState) => {
    seedCorp(state, 'video', ['5B', '5C', '5D', '5E']);
    seedCorp(state, 'books', ['5G', '5H', '5I']);
    seedCorp(state, 'air', ['2F', '3F', '4F']);
    state.seats[0]!.holdings.books = 4;
    state.seats[0]!.holdings.air = 3;
    state.seats[1]!.holdings.books = 2;
    state.seats[1]!.holdings.air = 5;
    state.hands[0] = ['5F'];
  },
};

describe('the merger beat staging', () => {
  const chains = (...counts: number[]) => counts.map((n) => ({ bonuses: Array(n).fill(0) }));

  it('runs one collide/blend/bonus pass per absorption, then one shared tail', () => {
    const stages = stagesFor(chains(2, 2)).map((s) => `${s.kind}${s.chain ?? ''}`);
    expect(stages).toEqual([
      'collide0', 'blend0', 'bonus0',
      'collide1', 'blend1', 'bonus1',
      'name', 'mass', 'settle',
    ]);
  });

  it('skips a bonus stage for a chain that paid nobody', () => {
    expect(stagesFor(chains(0)).map((s) => s.kind)).toEqual(['collide', 'blend', 'name', 'mass', 'settle']);
  });

  it('shows the whole absorbed mass, one block per company eaten', async () => {
    const user = userEvent.setup();
    render(<DebugBeatPreview kind="merger-three-way" onDismiss={() => {}} />);
    const dialog = screen.getByRole('dialog');
    // collide, blend, bonus for each of two chains, then the name — the mass
    // stage is next. Clicking is what the player does to move the beat on.
    for (let i = 0; i < 7; i++) await act(async () => { await user.click(dialog); });

    // One per defunct chain, in resolution order: an absorption that was
    // deduped away upstream would leave the survivor apparently eating one
    // company while the caption claimed two.
    const blocks = [...dialog.querySelectorAll('[data-mass-block]')].map((el) =>
      el.getAttribute('data-mass-block'),
    );
    expect(blocks).toEqual(['energy', 'air']);
    expect(dialog).toHaveTextContent(/2 companies eaten/i);
  });

  it('keeps a single-chain merger on its original timings, and fits three chains in the watchdog', () => {
    const total = (n: number[]) => stagesFor(chains(...n)).reduce((sum, s) => sum + s.ms, 0);
    expect(total([2])).toBe(16600); // unchanged from before the restructure
    expect(total([2, 2, 2])).toBeLessThan(30_000); // BeatContext's WATCHDOG_MS
  });
});

describe('a three-way merger', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves one chain at a time and plays the merger beat exactly once', async () => {
    const { client } = await renderPanel(
      <BeatProvider>
        <BeatOrchestrator />
        <DecisionModal />
      </BeatProvider>,
      threeWay,
    );
    const send = async (command: Parameters<typeof client.dispatch>[0]) => {
      await act(async () => {
        client.dispatch(command);
        await flush();
      });
    };

    await send({ type: 'place-tile', seat: 0, tile: '5F' });
    await send({ type: 'choose-defunct-order', seat: 0, next: 'books' });
    await send({ type: 'dispose-shares', seat: 0, hold: 4, sell: 0, trade: 0 });
    await send({ type: 'dispose-shares', seat: 1, hold: 2, sell: 0, trade: 0 });
    await send({ type: 'dispose-shares', seat: 0, hold: 3, sell: 0, trade: 0 });
    await send({ type: 'dispose-shares', seat: 1, hold: 5, sell: 0, trade: 0 });

    const log = client.store.getState().log;
    const types = log.map((e) => e.type);

    // one merger, not a chain of two-way ones
    expect(types.filter((t) => t === 'merger-started')).toHaveLength(1);
    expect(types.filter((t) => t === 'merger-completed')).toHaveLength(1);

    // strictly sequenced: books' bonuses, books' disposals, books defunct, only
    // then air — never interleaved
    const order = log
      .filter((e) =>
        ['bonus-paid', 'shares-disposed', 'corporation-defunct'].includes(e.type),
      )
      .map((e) =>
        `${e.type}:${'defunct' in e ? e.defunct : 'industry' in e ? e.industry : ''}`,
      );
    expect(order).toEqual([
      'bonus-paid:books',
      'shares-disposed:books',
      'shares-disposed:books',
      'corporation-defunct:books',
      'bonus-paid:air',
      'shares-disposed:air',
      'shares-disposed:air',
      'corporation-defunct:air',
    ]);

    // and the climax plays once, not once per chain
    const mergerPlays = vi.mocked(soundManager.play).mock.calls.filter(([id]) => id === 'merger');
    expect(mergerPlays).toHaveLength(1);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('prices each chain on its own pre-merger size, not on the growing survivor', async () => {
    // The invariant that makes sequencing matter: books is resolved and its
    // three tiles are stashed before air's bonuses are computed, but air must
    // still be paid as a size-3 corporation. If the survivor absorbed as it
    // went — or if the placed tile counted — air would pay far more.
    const { client } = await renderPanel(
      <BeatProvider>
        <BeatOrchestrator />
        <DecisionModal />
      </BeatProvider>,
      threeWay,
    );
    const send = async (command: Parameters<typeof client.dispatch>[0]) => {
      await act(async () => {
        client.dispatch(command);
        await flush();
      });
    };

    await send({ type: 'place-tile', seat: 0, tile: '5F' });
    await send({ type: 'choose-defunct-order', seat: 0, next: 'books' });
    await send({ type: 'dispose-shares', seat: 0, hold: 4, sell: 0, trade: 0 });
    await send({ type: 'dispose-shares', seat: 1, hold: 2, sell: 0, trade: 0 });
    await send({ type: 'dispose-shares', seat: 0, hold: 3, sell: 0, trade: 0 });
    await send({ type: 'dispose-shares', seat: 1, hold: 5, sell: 0, trade: 0 });

    const bonuses = client.store
      .getState()
      .log.flatMap((e) => (e.type === 'bonus-paid' ? [e] : []));
    // books: tier 1 at size 3. air: tier 2 at size 3 — one band dearer, and
    // unaffected by books having just been swallowed.
    expect(bonuses.map((b) => [b.defunct, b.payouts[0]?.amount])).toEqual([
      ['books', 3000],
      ['air', 4000],
    ]);
  });
});
