import { act } from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DecisionModal } from './DecisionModal.js';
import { NAMES, flush, renderPanel, seedCorp } from '../testing/harness.js';

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
    expect(within(dialog).getByRole('button', { name: new RegExp(NAMES.video) })).toBeInTheDocument();
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
      await userEvent.click(screen.getByRole('button', { name: new RegExp(NAMES.video) }));
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
    expect(within(dialog).getByRole('button', { name: new RegExp(NAMES.air) })).toBeInTheDocument();
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

  it('shows what the shares are worth: the per-share price and the live sale value', async () => {
    // Without this the player had raw counts only, and had to work the
    // tier/size price out of the reference chart themselves before deciding
    // whether to sell (#3).
    const { client } = await renderPanel(<DecisionModal />, {
      craft: (state) => {
        seedCorp(state, 'video', ['2E', '3E', '4E']); // survives
        seedCorp(state, 'books', ['6E', '7E']); // defunct at size 2 -> $200 a share
        state.hands[0] = ['5E'];
        state.seats[0]!.holdings.books = 4;
      },
    });
    await place(client, '5E');

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/sells at \$200 a share/)).toBeInTheDocument();
    // nothing selected yet
    expect(within(dialog).getByText('→ $0')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'sell more' }));
    expect(within(dialog).getByText('→ $200')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'sell more' }));
    expect(within(dialog).getByText('→ $400')).toBeInTheDocument();
  });

  it('names both corporations by company name, not the industry key', async () => {
    const { client } = await renderPanel(<DecisionModal />, {
      craft: (state) => {
        seedCorp(state, 'video', ['2E', '3E', '4E']); // survives -> the video corp
        seedCorp(state, 'books', ['6E', '7E']); // defunct -> Chapter Eleven
        state.hands[0] = ['5E'];
        state.seats[0]!.holdings.books = 4;
      },
    });
    await place(client, '5E');

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Dispose of Chapter Eleven stock');
    expect(dialog).toHaveTextContent(new RegExp(`trade is 2-for-1 into ${NAMES.video}`));
    // never the raw industry keys
    expect(dialog).not.toHaveTextContent(/\bbooks\b/);
    expect(dialog).not.toHaveTextContent(/\bvideo\b/);
  });

  it('still names the corporations when the disposing seat is not the active seat', async () => {
    // seat 1 places the merging tile; seat 0 holds the defunct stock. The
    // disposal decision belongs to seat 0, whose turn it is *not* — the prompt
    // must still resolve the corporation names (they are public).
    const { client } = await renderPanel(<DecisionModal />, {
      craft: (state) => {
        seedCorp(state, 'video', ['2E', '3E', '4E']);
        seedCorp(state, 'books', ['6E', '7E']);
        state.turnPointer = 1;
        state.hands[1] = ['5E'];
        state.seats[0]!.holdings.books = 3;
      },
    });
    await act(async () => {
      client.dispatch({ type: 'place-tile', seat: 1, tile: '5E' });
      await flush();
    });

    // disposal is owed by seat 0, mergemaker is seat 1 -> hand-off first
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /show my decision/ }));
      await flush();
    });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Dispose of Chapter Eleven stock');
    expect(dialog).toHaveTextContent(new RegExp(`into ${NAMES.video}`));
    expect(dialog).not.toHaveTextContent(/\bbooks\b/);
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
    // one button per unfounded company (7), plus the minimize button
    expect(within(dialog).getAllByRole('button').length).toBeGreaterThanOrEqual(7);
  });

  it('each founding option shows its tier and opening value by default', async () => {
    const { client } = await renderPanel(<DecisionModal />, {
      craft: (state) => {
        state.cells['6F'] = { kind: 'unincorporated' };
        state.hands[0] = ['6E'];
      },
    });
    await place(client, '6E');
    const dialog = screen.getByRole('dialog');

    // a tier-3 corp opens at $400/share, bonus from $4,000 — shown without a toggle
    expect(dialog).toHaveTextContent(/tier 3 · \$400\/share · bonus from \$4,000/);
    expect(dialog).toHaveTextContent(/tier 1 · \$200\/share/);
  });

  it('the founding modal minimizes to a pill and restores', async () => {
    const { client } = await renderPanel(<DecisionModal />, {
      craft: (state) => {
        state.cells['6F'] = { kind: 'unincorporated' };
        state.hands[0] = ['6E'];
      },
    });
    await place(client, '6E');

    await userEvent.click(screen.getByRole('button', { name: /Peek at the board/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Resume founding/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByText('Found a corporation')).toBeInTheDocument();
  });

  it('the disposal prompt minimizes to a pill and restores, keeping the split entered', async () => {
    const { client } = await renderPanel(<DecisionModal />, {
      craft: (state) => {
        seedCorp(state, 'video', ['2E', '3E', '4E']); // survives
        seedCorp(state, 'books', ['6E', '7E']); // defunct
        state.hands[0] = ['5E'];
        state.seats[0]!.holdings.books = 4;
      },
    });
    await place(client, '5E');

    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'sell more' }));

    await userEvent.click(screen.getByRole('button', { name: /Peek at the board/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Resume trading in stock/ }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Dispose of Chapter Eleven stock');
    expect(within(dialog).getByLabelText('sell')).toHaveTextContent('1');
  });

  it('founds for the active seat even when it is not seat 0 (regression: not-your-turn)', async () => {
    // seat 2 places a founding tile
    const { client } = await renderPanel(<DecisionModal />, {
      craft: (state) => {
        state.turnPointer = 2;
        state.cells['6F'] = { kind: 'unincorporated' };
        state.hands[2] = ['6E'];
      },
    });
    await act(async () => {
      client.dispatch({ type: 'place-tile', seat: 2, tile: '6E' });
      await flush();
    });

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Found a corporation')).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Cy · new group'); // the active seat's name, not "Seat 0"

    await act(async () => {
      await userEvent.click(within(dialog).getByRole('button', { name: new RegExp(NAMES.video) }));
      await flush();
    });
    // the command was issued for seat 2 and accepted — no rejection, modal closed
    expect(client.store.getState().lastError).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(client.store.getState().views[2]!.step).toBe('buy');
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

describe('DecisionModal — hot-seat hand-off', () => {
  it("hands the machine to a disposing seat that isn't the mergemaker", async () => {
    const { client } = await renderPanel(<DecisionModal />, {
      craft: (state) => {
        seedCorp(state, 'video', ['2E', '3E', '4E']); // survives
        seedCorp(state, 'books', ['6E', '7E']); // defunct
        state.seats[2]!.holdings.books = 4; // Cy (seat 2) must dispose; mergemaker is seat 0
        state.hands[0] = ['5E'];
      },
    });
    await place(client, '5E');

    const dialog = screen.getByRole('dialog');
    // the hand-off screen, not the disposal controls
    expect(dialog).toHaveTextContent('Hand the machine to');
    expect(dialog).toHaveTextContent('Cy');
    expect(within(dialog).queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
    // Cy's holdings must not leak on the hand-off screen
    expect(dialog).not.toHaveTextContent('holds 4');

    await act(async () => {
      await userEvent.click(within(dialog).getByRole('button', { name: /show my decision/ }));
      await flush();
    });

    // now the disposal prompt for Cy
    expect(screen.getByRole('dialog')).toHaveTextContent('Dispose of');
    expect(screen.getByRole('dialog')).toHaveTextContent('Cy holds 4');
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
  });

  it('hands off by real name even when the mergemaker is a bot (regression: names fell back to "Player N")', async () => {
    // seat 0 (the mergemaker) is not a local seat here, standing in for a bot
    // — this is the shape that broke: the hand-off screen resolved its "view"
    // from the *active* seat (the bot), got null, and every name fell back to
    // "Player N" instead of Ben's actual name — even though the disposing seat
    // (Ben) is local and its own name is public information.
    const { client } = await renderPanel(<DecisionModal />, {
      localSeats: [1, 2],
      craft: (state) => {
        seedCorp(state, 'video', ['2E', '3E', '4E']); // survives
        seedCorp(state, 'books', ['6E', '7E']); // defunct
        state.seats[1]!.holdings.books = 4; // Ben (seat 1) must dispose
        state.hands[0] = ['5E'];
      },
    });
    await act(async () => {
      client.dispatch({ type: 'place-tile', seat: 0, tile: '5E' });
      await flush();
    });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Hand the machine to');
    expect(dialog).toHaveTextContent('Ben');
    expect(dialog).not.toHaveTextContent(/Player \d/);
  });

  it('does not hand off when the decision belongs to the mergemaker (a size tie)', async () => {
    const { client } = await renderPanel(<DecisionModal />, {
      craft: (state) => {
        seedCorp(state, 'video', ['3E', '4E']); // tied
        seedCorp(state, 'books', ['6E', '7E']); // tied
        state.hands[0] = ['5E'];
      },
    });
    await place(client, '5E'); // seat 0 is the mergemaker and picks the survivor

    const dialog = screen.getByRole('dialog');
    expect(dialog).not.toHaveTextContent('Hand the machine to');
    expect(dialog).toHaveTextContent('Choose the surviving corporation');
  });

  it('re-hands the machine to each disposing seat in turn', async () => {
    const { client } = await renderPanel(<DecisionModal />, {
      craft: (state) => {
        seedCorp(state, 'video', ['2E', '3E', '4E']); // survives
        seedCorp(state, 'books', ['6E', '7E']); // defunct
        state.seats[1]!.holdings.books = 2; // Ben (seat 1)
        state.seats[2]!.holdings.books = 2; // Cy (seat 2)
        state.hands[0] = ['5E'];
      },
    });
    await place(client, '5E');

    // hand to Ben (clockwise from mergemaker seat 0: 0,1,2 -> seat 1 first)
    let dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Ben');
    await act(async () => {
      await userEvent.click(within(dialog).getByRole('button', { name: /show my decision/ }));
      await flush();
    });
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Confirm' })); // Ben holds 2
      await flush();
    });

    // now hand to Cy — a fresh hand-off, not Ben's prompt again
    dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Hand the machine to');
    expect(dialog).toHaveTextContent('Cy');
  });
});
