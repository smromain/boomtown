import { act } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BEAT_PREVIEWS, type PreviewKind } from './fixtures.js';
import { latestMerger } from '../../game/story.js';
import { DebugBeatPreview } from './DebugBeatPreview.js';

vi.mock('../../audio/soundManager.js', () => ({ soundManager: { play: vi.fn(), isMuted: () => false, setMuted: vi.fn() } }));

afterEach(() => {
  vi.clearAllMocks();
});

describe('fixtures (debug menu)', () => {
  // A preview kind is a *scenario*, not a beat id: several scenarios can
  // exercise the same beat, which is the point — a three-way merger is the
  // shape a single-chain fixture could never catch.
  it('every preview builds a valid, engine-real PlayerView for a beat it names', () => {
    for (const kind of Object.keys(BEAT_PREVIEWS) as PreviewKind[]) {
      const preview = BEAT_PREVIEWS[kind]();
      expect(kind.startsWith(preview.beat.id)).toBe(true);
      expect(preview.view.ruleset).toBeDefined();
    }
  });

  it('the three-way fixture keeps both absorptions, with the payouts of each', () => {
    const { log } = BEAT_PREVIEWS['merger-three-way']();
    const story = latestMerger(log)!;
    expect(story.chains.map((c) => c.defunct)).toEqual(['energy', 'air']);
    // Both chains pay the same amounts — the case that used to collapse into one
    expect(story.chains.map((c) => c.bonuses.length)).toEqual([2, 2]);
    expect(story.bonuses).toHaveLength(4);
    // and every seat that was paid is represented
    expect(new Set(story.bonuses.flatMap((b) => b.seats))).toEqual(new Set([0, 1, 2]));
  });

  it("the merger fixture's view already carries the accreted survivor name", () => {
    const { view } = BEAT_PREVIEWS.merger();
    expect(view.corporations.books.displayName).not.toBe('Chapter Eleven');
    expect(view.corporations.books.eaten).toContain('energy');
    expect(view.corporations.energy.founded).toBe(false);
  });
});

describe('DebugBeatPreview', () => {
  it('renders nothing when no kind is selected', () => {
    const { container } = render(<DebugBeatPreview kind={null} onDismiss={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each(['founding', 'buy-stock', 'merger', 'merger-three-way', 'motion', 'endgame', 'victory'] satisfies PreviewKind[])(
    'renders the %s beat and dismisses on Escape',
    async (kind) => {
      const onDismiss = vi.fn();
      render(<DebugBeatPreview kind={kind} onDismiss={onDismiss} />);
      expect(screen.getByRole(kind === 'buy-stock' ? 'status' : 'dialog')).toBeInTheDocument();

      await act(async () => {
        await userEvent.keyboard('{Escape}');
      });
      expect(onDismiss).toHaveBeenCalledOnce();
    },
  );
});
