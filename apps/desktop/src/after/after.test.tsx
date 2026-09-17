import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  INDUSTRIES,
  boomtown,
  createGame,
  legalMoves,
  reduce,
  retrospective,
  type Command,
  type CorpView,
  type Industry,
  type RankingRow,
  type Retrospective,
} from '@boomtown/engine';
import { AfterGame } from './AfterGame.js';

const NAMES = ['Ana', 'Ben', 'Cy'];

/**
 * One real game, played by a rule so the fixture is a genuine record rather
 * than a hand-written one: every frame is drawn from the same command log the
 * app would get, mergers, refoundings and all.
 */
function playedGame(): { record: Retrospective; rankings: readonly RankingRow[] } {
  const initial = createGame({
    seats: NAMES.map((name) => ({ name })),
    seed: 20250917,
    ruleset: boomtown,
    turnOrder: [0, 1, 2],
  });
  const log: Command[] = [];
  let state = initial;
  for (let step = 0; step < 6000 && state.status === 'playing'; step += 1) {
    const moves = legalMoves(state);
    if (moves.length === 0) break;
    const command = moves.find((move) => move.type === 'announce-end') ?? moves[moves.length - 1]!;
    const result = reduce(state, command);
    if (!result.ok) throw new Error(result.error.code);
    log.push(command);
    state = result.state;
  }
  return { record: retrospective(initial, log), rankings: state.result?.rankings ?? [] };
}

const corporations = Object.fromEntries(
  INDUSTRIES.map((industry): [Industry, CorpView] => [
    industry,
    {
      founded: false,
      safe: false,
      size: 0,
      hqTile: null,
      tiles: [],
      sharePrice: null,
      bankShares: 25,
      baseName: `Corp ${industry}`,
      displayName: `Corp ${industry}`,
      flavour: 'a flavour line',
      eaten: [],
    },
  ]),
) as Record<Industry, CorpView>;

const fixture = playedGame();

const renderAfter = (over: Partial<Parameters<typeof AfterGame>[0]> = {}) =>
  render(
    <AfterGame
      record={fixture.record}
      rankings={fixture.rankings}
      names={NAMES}
      corporations={corporations}
      reader={0}
      {...over}
    />,
  );

describe('the after-game carousel', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens on the standings', () => {
    renderAfter();
    expect(screen.getByRole('tab', { name: 'Standings' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Final standings')).toBeInTheDocument();
  });

  it('offers a tab per frame the game actually earned', () => {
    renderAfter();
    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs).toEqual(['Standings', 'Tracking the market', 'Company by company', 'Awards']);
  });

  it('turns itself over', () => {
    renderAfter();
    act(() => {
      vi.advanceTimersByTime(8200);
    });
    expect(screen.getByRole('tab', { name: 'Tracking the market' })).toHaveAttribute('aria-selected', 'true');
  });

  it('steps forward a frame at a time with the transport controls', () => {
    renderAfter();
    fireEvent.click(screen.getByRole('button', { name: 'Forward' }));
    expect(screen.getByRole('tab', { name: 'Tracking the market' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('tab', { name: 'Standings' })).toHaveAttribute('aria-selected', 'true');
  });

  it('wraps backwards from the first frame to the last', () => {
    renderAfter();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('tab', { name: 'Awards' })).toHaveAttribute('aria-selected', 'true');
  });

  it('pauses, and stays paused — the inner cycle stops with it', () => {
    renderAfter();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByRole('tab', { name: 'Standings' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('steps the *inner* cycle, so a frame of five companies takes five presses to leave', () => {
    renderAfter();
    fireEvent.click(screen.getByRole('tab', { name: 'Company by company' }));
    const first = screen.getByText(/Company 1 of \d+/).textContent ?? '';
    const total = Number(/of (\d+)/.exec(first)?.[1] ?? '1');
    expect(total).toBeGreaterThan(1);

    fireEvent.click(screen.getByRole('button', { name: 'Forward' }));
    expect(screen.getByText(`Company 2 of ${total}`)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Company by company' })).toHaveAttribute('aria-selected', 'true');

    for (let press = 2; press <= total; press += 1) fireEvent.click(screen.getByRole('button', { name: 'Forward' }));
    expect(screen.getByRole('tab', { name: 'Awards' })).toHaveAttribute('aria-selected', 'true');
  });

  it('answers the arrow keys and the space bar', () => {
    renderAfter();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    });
    expect(screen.getByRole('tab', { name: 'Tracking the market' })).toHaveAttribute('aria-selected', 'true');
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    });
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('shows the awards five at a time and pages through them', () => {
    renderAfter();
    fireEvent.click(screen.getByRole('tab', { name: 'Awards' }));
    const page = screen.getByText(/Page 1 of \d+/);
    expect(page).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Forward' }));
    expect(screen.getByText(/Page 2 of \d+/)).toBeInTheDocument();
  });

  it('names a seat the same way in every frame', () => {
    renderAfter();
    const standings = screen.getByText('Final standings').closest('section')!;
    expect(within(standings).getByText('Ana')).toBeInTheDocument();
  });
});

describe('a game with nothing to look back on', () => {
  it('shows the standings alone rather than an empty carousel', () => {
    render(
      <AfterGame
        record={null}
        rankings={[{ seat: 0, cash: 6000, equity: 0, total: 6000, holdings: [] }]}
        names={NAMES}
        corporations={corporations}
        reader={0}
      />,
    );
    expect(screen.getAllByRole('tab')).toHaveLength(1);
    expect(screen.getByRole('tab', { name: 'Standings' })).toBeInTheDocument();
  });
});
