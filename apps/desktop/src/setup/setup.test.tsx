import { act } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { classic, edition2015 } from '@boomtown/engine';
import { describe, expect, it, vi } from 'vitest';
import { NewGame, type StartedGame } from './NewGame.js';
import {
  configError,
  defaultConfig,
  resizeSeats,
  toSetupOptions,
  type GameConfig,
} from './gameConfig.js';

const config = (over: Partial<GameConfig> = {}): GameConfig => ({ ...defaultConfig(), seed: 1, ...over });

describe('configError', () => {
  it('accepts a plain two-human game', () => {
    expect(configError(config())).toBeNull();
  });

  it('clamps seat count to 2–6', () => {
    expect(configError(config({ seats: resizeSeats([], 1) }))).toBeNull(); // resize floors at 2
    expect(resizeSeats([], 1)).toHaveLength(2);
    expect(resizeSeats(defaultConfig().seats, 9)).toHaveLength(6);
  });

  it('rejects a blank seat name', () => {
    const seats = [...defaultConfig().seats];
    seats[0] = { ...seats[0]!, name: '  ' };
    expect(configError(config({ seats }))).toMatch(/name/);
  });

  it('blocks an all-bot game while bots are inert', () => {
    const seats = defaultConfig().seats.map((s) => ({ ...s, kind: 'bot' as const }));
    expect(configError(config({ seats }), false)).toMatch(/all-bot/);
    expect(configError(config({ seats }), true)).toBeNull(); // allowed once U14 lands
  });
});

describe('toSetupOptions', () => {
  it('carries the seat names in screen order as play order', () => {
    const seats = [
      { name: 'Ana', kind: 'human' as const, difficulty: 5 },
      { name: 'Bo', kind: 'bot' as const, difficulty: 8 },
      { name: 'Cy', kind: 'human' as const, difficulty: 5 },
    ];
    const options = toSetupOptions(config({ seats }));
    expect(options.seats).toEqual([{ name: 'Ana' }, { name: 'Bo' }, { name: 'Cy' }]);
    expect(options.turnOrder).toEqual([0, 1, 2]);
  });

  it('maps the edition choice to the ruleset preset', () => {
    expect(toSetupOptions(config({ edition: 'classic' })).ruleset).toBe(classic);
    expect(toSetupOptions(config({ edition: 'edition-2015' })).ruleset).toBe(edition2015);
  });

  it('passes the visibility setting through', () => {
    expect(toSetupOptions(config({ visibility: 'hidden' })).visibility).toBe('hidden');
  });

  it('uses a fixed seed when given, a fresh one otherwise', () => {
    expect(toSetupOptions(config({ seed: 99 })).seed).toBe(99);
    const a = toSetupOptions({ ...defaultConfig() }).seed;
    const b = toSetupOptions({ ...defaultConfig() }).seed;
    expect(a).not.toBe(b);
  });
});

describe('NewGame screen', () => {
  const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  it('starts a 3-human / 2-bot game with the chosen seats, difficulties, edition and visibility', async () => {
    let started: StartedGame | undefined;
    render(<NewGame onStart={(game) => (started = game)} />);

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Seats' }), '5');
    await userEvent.selectOptions(screen.getByLabelText('Seat 4 type'), 'bot');
    await userEvent.selectOptions(screen.getByLabelText('Seat 5 type'), 'bot');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Edition' }), 'edition-2015');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Cash and holdings' }), 'hidden');

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Start game' }));
      await flush();
    });

    expect(started).toBeDefined();
    expect(started!.config.seats).toHaveLength(5);
    expect(started!.config.seats[3]!.kind).toBe('bot');
    expect(started!.config.edition).toBe('edition-2015');
    const view = started!.client.store.getState().views[0]!;
    expect(view.seats).toHaveLength(5);
    expect(view.seats[1]?.cash).toBeNull(); // hidden
    expect(view.ruleset).toBe(edition2015);
  });

  it('blocks starting an all-bot game and shows why', async () => {
    const onStart = vi.fn();
    render(<NewGame onStart={onStart} />);
    await userEvent.selectOptions(screen.getByLabelText('Seat 1 type'), 'bot');
    await userEvent.selectOptions(screen.getByLabelText('Seat 2 type'), 'bot');

    expect(screen.getByRole('alert')).toHaveTextContent(/all-bot/);
    expect(screen.getByRole('button', { name: 'Start game' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Start game' }));
    expect(onStart).not.toHaveBeenCalled();
  });
});
