import { act } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BEAT_PREVIEWS, type PreviewKind } from './fixtures.js';
import { DebugBeatPreview } from './DebugBeatPreview.js';

vi.mock('../../audio/soundManager.js', () => ({ soundManager: { play: vi.fn(), isMuted: () => false, setMuted: vi.fn() } }));

afterEach(() => {
  vi.clearAllMocks();
});

describe('fixtures (debug menu)', () => {
  it('every preview builds a valid, engine-real PlayerView without throwing', () => {
    for (const kind of Object.keys(BEAT_PREVIEWS) as PreviewKind[]) {
      const preview = BEAT_PREVIEWS[kind]();
      expect(preview.beat.id).toBe(kind);
      expect(preview.view.ruleset).toBeDefined();
    }
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

  it.each(['founding', 'buy-stock', 'merger', 'motion', 'endgame', 'victory'] satisfies PreviewKind[])(
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
