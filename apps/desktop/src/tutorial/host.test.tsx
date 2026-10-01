import { act } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { GameScreen } from '../game/GameScreen.js';
import { startTutorial } from './startTutorial.js';
import { copy } from '../copy/copy.js';

const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

describe('tutorial host', () => {
  it('welcomes, points at the tile it wants, and turns away any other', async () => {
    const game = await act(() => startTutorial());
    render(<GameScreen game={game} />);
    await flush();
    const host = screen.getByRole('complementary', { name: copy.tutorial.label });
    expect(host.closest('[data-rail]')).not.toBeNull();
    expect(within(host).getByText(copy.tutorial.steps.welcome)).toBeInTheDocument();

    // Nothing moves until the welcome has been read.
    const rack = screen.getByRole('region', { name: 'Your tiles' });
    await userEvent.click(within(rack).getByRole('button', { name: /7F/ }));
    await flush();
    expect(game.client.store.getState().log).toHaveLength(0);

    await userEvent.click(within(host).getByRole('button', { name: copy.tutorial.start }));
    expect(within(host).getByText(copy.tutorial.steps.place)).toBeInTheDocument();
    expect(within(rack).getByRole('button', { name: /7F/ })).toHaveAttribute('data-hint');

    // Off the script: refused, and the host nudges.
    await userEvent.click(within(rack).getByRole('button', { name: /1I/ }));
    await flush();
    expect(game.client.store.getState().log).toHaveLength(0);
    expect(game.tutorial!.store.getState().nudges).toBe(2);

    await userEvent.click(within(rack).getByRole('button', { name: /7F/ }));
    await flush();
    expect(game.client.store.getState().log.some((e) => e.type === 'tile-placed' && e.tile === '7F')).toBe(true);
    game.detachBots?.();
  });
});
