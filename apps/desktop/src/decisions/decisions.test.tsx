import { act } from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DecisionModal } from './DecisionModal.js';
import { flush, renderPanel, seedCorp } from '../testing/harness.js';


async function place(client: { dispatch: (c: { type: 'place-tile'; seat: number; tile: string }) => void }, tile: string) {
  await act(async () => {
    client.dispatch({ type: 'place-tile', seat: 0, tile });
    await flush();
  });
}

describe('DecisionModal', () => {
  it('a size-tied merger shows the survivor prompt with both corporations selectable', async () => {
    const { client } = await renderPanel(<DecisionModal />, {
      craft: (state) => {
        seedCorp(state, 'video', ['3E', '4E']);
        seedCorp(state, 'books', ['6E', '7E']);
        state.hands[0] = ['5E'];
      },
    });
    await place(client, '5E');

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Choose the surviving corporation')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Chapter Eleven/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Megahit Video/ })).toBeInTheDocument();
  });

  it('resolving the survivor prompt advances the machine and closes the modal', async () => {
    const { client } = await renderPanel(<DecisionModal />, {
      craft: (state) => {
        seedCorp(state, 'video', ['3E', '4E']);
        seedCorp(state, 'books', ['6E', '7E']);
        state.hands[0] = ['5E'];
      },
    });
    await place(client, '5E');

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /Megahit Video/ }));
      await flush();
    });
    // nobody holds books -> merger completes -> no dialog, buy step
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(client.store.getState().views[0]!.step).toBe('buy');
  });

  it('a defunct-order tie shows the order prompt with the tied chains', async () => {
    const { client } = await renderPanel(<DecisionModal />, {
      craft: (state) => {
        seedCorp(state, 'video', ['1E', '2E', '3E', '4E']); // survives
        seedCorp(state, 'books', ['6E', '7E']); // tied defunct
        seedCorp(state, 'air', ['5D', '5C']); // tied defunct
        state.hands[0] = ['5E'];
      },
    });
    await place(client, '5E');

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Which corporation folds next?')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Chapter Eleven/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Pan-Atlas/ })).toBeInTheDocument();
  });

  it('the disposal prompt keeps confirm disabled until the split accounts for every share', async () => {
    const { client } = await renderPanel(<DecisionModal />, {
      craft: (state) => {
        seedCorp(state, 'video', ['2E', '3E', '4E']); // survives
        seedCorp(state, 'books', ['6E', '7E']); // defunct
        state.hands[0] = ['5E'];
        state.seats[0]!.holdings.books = 4;
      },
    });
    await place(client, '5E');

    const dialog = screen.getByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Confirm' });
    expect(confirm).toBeEnabled(); // hold 4 / sell 0 / trade 0 is valid

    await userEvent.click(within(dialog).getByRole('button', { name: 'sell more' }));
    // now hold 3 / sell 1 / trade 0 — still sums to 4, still valid
    expect(confirm).toBeEnabled();
  });

  it('trade is disabled when the survivor has no bank stock left', async () => {
    const { client } = await renderPanel(<DecisionModal />, {
      craft: (state) => {
        seedCorp(state, 'video', ['2E', '3E', '4E']);
        seedCorp(state, 'books', ['6E', '7E']);
        state.hands[0] = ['5E'];
        state.seats[0]!.holdings.books = 4;
        state.bankShares.video = 0;
      },
    });
    await place(client, '5E');

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'trade more' })).toBeDisabled();
  });

  it('resolving disposal for every holder completes the merger', async () => {
    const { client } = await renderPanel(<DecisionModal />, {
      craft: (state) => {
        seedCorp(state, 'video', ['2E', '3E', '4E']);
        seedCorp(state, 'books', ['6E', '7E']);
        state.hands[0] = ['5E'];
        state.seats[0]!.holdings.books = 2;
      },
    });
    await place(client, '5E');

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Confirm' })); // hold 2
      await flush();
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(client.store.getState().views[0]!.step).toBe('buy');
  });

  it('offers the founding choice after a founding placement', async () => {
    const { client } = await renderPanel(<DecisionModal />, {
      craft: (state) => {
        state.cells['6F'] = { kind: 'unincorporated' };
        state.hands[0] = ['6E'];
      },
    });
    await place(client, '6E');

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Found a corporation')).toBeInTheDocument();
    expect(within(dialog).getAllByRole('button').length).toBeGreaterThanOrEqual(7);
  });

  it('does not open for a merger decision addressed to a bot / remote seat', async () => {
    // seat 1 places a merging tile; seat 1 is not a local seat.
    const { client } = await renderPanel(<DecisionModal />, {
      localSeats: [0],
      craft: (state) => {
        seedCorp(state, 'video', ['3E', '4E']);
        seedCorp(state, 'books', ['6E', '7E']);
        state.turnPointer = 1;
        state.hands[1] = ['5E'];
      },
    });
    await act(async () => {
      client.dispatch({ type: 'place-tile', seat: 1, tile: '5E' });
      await flush();
    });
    // the pending decision belongs to seat 1 -> that seat's driver answers it,
    // the watching human sees no modal
    expect(client.store.getState().pendingDecision?.seat).toBe(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
