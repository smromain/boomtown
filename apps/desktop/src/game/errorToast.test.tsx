import { act } from 'react';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ErrorToast } from './ErrorToast.js';
import { flush, renderPanel } from '../testing/harness.js';

describe('ErrorToast', () => {
  it('is silent with no error', async () => {
    await renderPanel(<ErrorToast />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('surfaces a rejected command that would otherwise be a dead click', async () => {
    const { client } = await renderPanel(<ErrorToast />);
    await act(async () => {
      client.dispatch({ type: 'buy-shares', seat: 0, picks: {} }); // wrong step
      await flush();
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/not the buy step/i);
  });

  it('clears once a later command is accepted', async () => {
    const { client } = await renderPanel(<ErrorToast />);
    await act(async () => {
      client.dispatch({ type: 'buy-shares', seat: 0, picks: {} });
      await flush();
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    const tile = client.store.getState().views[0]!.yourHand[0]!;
    await act(async () => {
      client.dispatch({ type: 'place-tile', seat: 0, tile }); // accepted -> reconcile clears lastError
      await flush();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
