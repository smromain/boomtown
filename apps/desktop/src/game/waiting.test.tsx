import { act } from 'react';
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WaitingForSeat } from './Waiting.js';
import { defaultConfig, type GameConfig } from '../setup/gameConfig.js';
import { renderPanel } from '../testing/harness.js';

/** Seat 0 — the seat on the clock in a fresh game — held by a bot. */
const config: GameConfig = {
  ...defaultConfig(),
  seats: [
    { name: 'Robo', kind: 'bot', difficulty: 5 },
    { name: 'Ben', kind: 'human', difficulty: 5 },
    { name: 'Cy', kind: 'human', difficulty: 5 },
  ],
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

/** Past the 8s a seat may hold the clock before the nudge is offered. The
 *  timers have to be fake *before* the card mounts: the countdown is armed in
 *  a mount effect, and a real timer armed first will not answer to the clock. */
const overstay = async () => {
  await act(async () => {
    vi.advanceTimersByTime(9000);
  });
};

describe('the slow-bot nudge', () => {
  it('appears in a dev build once a bot has held the clock too long', async () => {
    vi.useFakeTimers();
    const nudge = vi.fn();
    await renderPanel(<WaitingForSeat config={config} nudge={nudge} snapshot={undefined} />, {
      localSeats: [1],
    });

    expect(screen.queryByRole('button', { name: /nudge/i })).not.toBeInTheDocument();
    await overstay();
    expect(screen.getByRole('button', { name: /nudge/i })).toBeInTheDocument();
  });

  it('never appears in a release build — the driver\'s watchdog covers it there', async () => {
    // It is a debugging tool: the snapshot it writes is only readable in a dev
    // build, and a player of a release build asked to prod their own opponents
    // is being shown our bug rather than offered a feature.
    vi.stubEnv('DEV', false);
    vi.useFakeTimers();
    const nudge = vi.fn();
    await renderPanel(<WaitingForSeat config={config} nudge={nudge} snapshot={undefined} />, {
      localSeats: [1],
    });

    await overstay();
    expect(screen.queryByRole('button', { name: /nudge/i })).not.toBeInTheDocument();
    // and the card itself still does its job
    expect(screen.getByRole('status', { name: 'Waiting for another player' })).toHaveTextContent('Ana');
  });
});
