import { act } from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { GameState } from '@boomtown/engine';
import { DecisionModal } from '../decisions/DecisionModal.js';
import { TurnModal } from './TurnModal.js';
import { TurnHandoff } from './TurnHandoff.js';
import type { GameConfig } from '../setup/gameConfig.js';
import { MotionPanel } from './MotionPanel.js';
import { flush, renderPanel, seedCorp } from '../testing/harness.js';

const row = (letter: string, count: number): string[] =>
  Array.from({ length: count }, (_, i) => `${i + 1}${letter}`);

/**
 * A Boomtown table parked at the end-check step with the motion window open:
 * two safe corporations (the quorum) and one unsafe one, so no end condition
 * is met and a motion is the only ending on offer.
 *
 * Register: Ana 5, Ben 5, Cy 4 — fourteen shares, quota 2/3, so ten carry it
 * and two backers are required. Ana and Ben together are exactly enough; Ana
 * and Cy are not, which is what makes both outcomes reachable in two clicks.
 */
function openWindow(state: GameState): void {
  seedCorp(state, 'books', row('A', 11));
  seedCorp(state, 'air', row('C', 11));
  seedCorp(state, 'video', ['1E', '2E']);
  state.seats[0]!.holdings.books = 5;
  state.seats[1]!.holdings.books = 3;
  state.seats[1]!.holdings.air = 2;
  state.seats[2]!.holdings.air = 4;
  state.step = 'end-check';
}

/** Three hot-seat humans, which is what makes the hand-offs below real. */
const CONFIG: GameConfig = {
  seats: [
    { name: 'Ana', kind: 'human', difficulty: 5 },
    { name: 'Ben', kind: 'human', difficulty: 5 },
    { name: 'Cy', kind: 'human', difficulty: 5 },
  ],
  edition: 'boomtown',
  visibility: 'hidden',
};

const board = (ui: React.ReactElement, localSeats?: readonly number[]) =>
  renderPanel(
    <>
      {ui}
      <DecisionModal />
      {/* The turn's own hand-off, not just a decision's: after voting, the
          machine is with the voter and has to go back to the seat whose turn
          it still is. */}
      <TurnHandoff config={CONFIG} />
    </>,
    { edition: 'boomtown', craft: openWindow, ...(localSeats ? { localSeats } : {}) },
  );

/** Hot-seat privacy: a decision owed to another seat asks for the machine first. */
async function handOff(name: string): Promise<void> {
  const claim = screen.queryByRole('button', { name: new RegExp(`I.m ${name}`) });
  if (!claim) return;
  await act(async () => {
    await userEvent.click(claim);
    await flush();
  });
}

async function click(name: RegExp): Promise<void> {
  await act(async () => {
    await userEvent.click(screen.getByRole('button', { name }));
    await flush();
  });
}

describe('the end-of-turn choice (TurnModal)', () => {
  it('offers the motion, and keeps ending the turn as the default', async () => {
    await board(<TurnModal />);
    const card = screen.getByRole('dialog');
    expect(within(card).getByRole('button', { name: /Move to liquidate/ })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: /End turn/ })).toBeInTheDocument();
    // No end condition is met, so announcing must not be on offer at all —
    // the two endings are mutually exclusive by construction (#26).
    expect(within(card).queryByRole('button', { name: /End the game/ })).not.toBeInTheDocument();
  });

  it('names the price of a motion before it takes one', async () => {
    await board(<TurnModal />);
    expect(screen.getByRole('dialog').textContent).toMatch(/open books/i);
  });

  it('offers nothing but ending the turn once the seat has spent its motion', async () => {
    await board(<TurnModal />);
    await click(/Move to liquidate/);
    await handOff('Ben');
    await click(/Vote against/); // Ben's 5 leaves Cy's 4 short of the ten needed

    // Ben took the machine to vote, so Ana has to take it back before her own
    // turn resumes — hot-seat privacy, the same hand-off any decision gets.
    await handOff('Ana');
    const card = screen.getByRole('dialog');
    expect(within(card).getByRole('button', { name: /End turn/ })).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: /Move to liquidate/ })).not.toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: /End the game/ })).not.toBeInTheDocument();
  });

  it('still offers the ordinary ending when an end condition is met', async () => {
    await renderPanel(<TurnModal />, {
      edition: 'boomtown',
      craft: (state) => {
        openWindow(state);
        // Every founded corporation safe — the classic trigger. A motion is
        // moot here, and the engine refuses one.
        seedCorp(state, 'video', row('G', 11));
      },
    });
    const card = screen.getByRole('dialog');
    expect(within(card).getByRole('button', { name: /End the game/ })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: /Keep playing/ })).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: /Move to liquidate/ })).not.toBeInTheDocument();
  });
});

describe('the vote', () => {
  it('asks the next seat, naming the mover, their weight and the cost of a yes', async () => {
    await board(<TurnModal />);
    await click(/Move to liquidate/);
    await handOff('Ben');

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Wind the game up?')).toBeInTheDocument();
    expect(within(dialog).getByText(/Ana moved to liquidate/)).toBeInTheDocument();
    expect(within(dialog).getByText(/you vote 5 shares/)).toBeInTheDocument();
    expect(within(dialog).getByText(/visible to everyone/)).toBeInTheDocument();
  });

  it('carries on the second backer and ends the game', async () => {
    const { client } = await board(<TurnModal />);
    await click(/Move to liquidate/);
    await handOff('Ben');
    await click(/Vote to liquidate/);

    // Ana's 5 + Ben's 5 = the ten needed, with the two backers required.
    expect(client.store.getState().views[0]!.status).toBe('over');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('fails the moment it cannot reach the quota, and opens the backers’ books', async () => {
    const { client } = await board(<TurnModal />);
    await click(/Move to liquidate/);
    await handOff('Ben');
    await click(/Vote against/);

    const view = client.store.getState().views[0]!;
    // Cy never votes: five against leaves four undecided against a ten-share
    // quota, so the motion is already doomed and the engine settles it.
    expect(view.status).toBe('playing');
    expect(view.motion).toBeNull();
    expect(view.openBooks).toEqual([0]);
    // The mover's own turn resumes where it left off.
    expect(view.step).toBe('end-check');
  });

  it('the mover cannot vote against their own motion — raising it is the yes', async () => {
    const { client } = await board(<TurnModal />);
    await click(/Move to liquidate/);
    const view = client.store.getState().views[0]!;
    expect(view.motion!.votes[0]).toBe(true);
    expect(view.motion!.waitingOn).toBe(1);
  });
});

describe('MotionPanel', () => {
  it('is absent until a motion publishes the register', async () => {
    await board(<MotionPanel />);
    expect(screen.queryByLabelText('The register')).not.toBeInTheDocument();
  });

  // Ana alone is local, so the vote owed to Ben opens no modal here. That is
  // not a convenience: an open Radix dialog marks the rest of the document
  // `aria-hidden`, so while your own vote is on screen the panel behind it is
  // not readable — and the seats this panel is *for* are the ones watching
  // someone else vote.
  it('shows the tally against the quota while the vote is open', async () => {
    await board(
      <>
        <TurnModal />
        <MotionPanel />
      </>,
      [0],
    );
    await click(/Move to liquidate/);

    const panel = screen.getByLabelText('The register');
    expect(within(panel).getByText('Motion to liquidate')).toBeInTheDocument();
    expect(within(panel).getByText(/Ana moved to wind the game up/)).toBeInTheDocument();
    expect(within(panel).getByText(/10 of 14 shares carry it/)).toBeInTheDocument();
    // Ana's five are in; Ben is being asked; Cy has not spoken.
    expect(within(panel).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '5');
    expect(within(panel).getByText('voting…')).toBeInTheDocument();
  });

  it('outlives the motion — a published register never un-publishes', async () => {
    await board(
      <>
        <TurnModal />
        <MotionPanel />
      </>,
    );
    await click(/Move to liquidate/);
    await handOff('Ben');
    await click(/Vote against/);

    const panel = screen.getByLabelText('The register');
    expect(within(panel).getByText('The register')).toBeInTheDocument();
    expect(within(panel).getByText('open books')).toBeInTheDocument();
    expect(within(panel).queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
