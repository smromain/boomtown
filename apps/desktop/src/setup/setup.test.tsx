import { act } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { boomtown, classic, edition2015 } from '@boomtown/engine';
import { describe, expect, it } from 'vitest';
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

  it('allows an all-bot game now that the bot driver can play every seat', () => {
    const seats = defaultConfig().seats.map((s) => ({ ...s, kind: 'bot' as const }));
    expect(configError(config({ seats }))).toBeNull();
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

  it('starts an all-bot game and hands back a bot-driver teardown', async () => {
    let started: StartedGame | undefined;
    render(<NewGame onStart={(game) => (started = game)} />);
    await userEvent.selectOptions(screen.getByLabelText('Seat 1 type'), 'bot');
    await userEvent.selectOptions(screen.getByLabelText('Seat 2 type'), 'bot');

    expect(screen.getByRole('alert')).toHaveTextContent('');
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Start game' }));
      await flush();
    });

    expect(started).toBeDefined();
    expect(started!.detachBots).toBeTypeOf('function');
    expect(started!.nudgeBots).toBeTypeOf('function');
    started!.detachBots!();
    started!.client.disconnect();
  });

  it('the attached driver actually plays: an all-bot game advances on its own', async () => {
    let started: StartedGame | undefined;
    render(<NewGame onStart={(game) => (started = game)} />);
    await userEvent.selectOptions(screen.getByLabelText('Seat 1 type'), 'bot');
    await userEvent.selectOptions(screen.getByLabelText('Seat 2 type'), 'bot');

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Start game' }));
      await flush();
    });

    const store = started!.client.store;
    expect(store.getState().activeSeat).toBe(0);
    const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    await act(async () => {
      for (let i = 0; i < 30 && store.getState().activeSeat === 0; i++) await wait(100);
    });
    expect(store.getState().activeSeat).not.toBe(0); // a bot moved the game on
    started!.detachBots!();
    started!.client.disconnect();
  }, 10000);

  it('localSeats is the human seats only — a bot seat is not a local seat', async () => {
    let started: StartedGame | undefined;
    render(<NewGame onStart={(game) => (started = game)} />);
    await userEvent.selectOptions(screen.getByLabelText('Seat 2 type'), 'bot');

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Start game' }));
      await flush();
    });

    expect(started!.localSeats).toEqual([0, 2]); // "Seat 2" is index 1 -> the bot
    started!.detachBots!();
    started!.client.disconnect();
  });

  it('does not attach a bot driver for an all-human table', async () => {
    let started: StartedGame | undefined;
    render(<NewGame onStart={(game) => (started = game)} />);

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Start game' }));
      await flush();
    });

    expect(started!.detachBots).toBeUndefined();
    started!.client.disconnect();
  });

  it('shows a rules summary covering both rule sets, naming no outside game', async () => {
    render(<NewGame onStart={() => {}} />);

    const rules = screen.getByText('How to play').closest('details')!;
    expect(rules).not.toHaveAttribute('open'); // collapsed on load
    expect(rules).toHaveTextContent(/A turn/);
    expect(rules).toHaveTextContent(/Mergers/);
    // the "differs" table names both rule sets and their key numbers
    expect(rules).toHaveTextContent(/Classic/);
    expect(rules).toHaveTextContent(/Modern/);
    expect(rules).toHaveTextContent(`${classic.safeSize} tiles`);
    expect(rules).toHaveTextContent(`${edition2015.endChainSize} tiles`);
    // never the trademarked names
    expect(rules).not.toHaveTextContent(/Acquire|Avalon Hill|Hasbro/i);
  });
});

describe('the Boomtown preset in setup', () => {
  const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  it('fixes the visibility control and says why', async () => {
    render(<NewGame onStart={() => {}} />);
    const visibility = screen.getByRole('combobox', { name: 'Cash and holdings' });
    expect(visibility).toBeEnabled();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Edition' }), 'boomtown');
    // Disabled *and* explained: a greyed-out control with no reason reads as a bug.
    expect(visibility).toBeDisabled();
    expect(visibility).toHaveValue('hidden');
    // Anchored on the field note, not on "books closed" alone: the how-to-play
    // summary above now explains the same rule, and a bare text match would
    // find that instead of the control's own explanation.
    expect(screen.getByText(/the ruleset fixes this/i)).toBeInTheDocument();
  });

  it('deals a closed-book table even when open was picked before switching preset', async () => {
    let started: StartedGame | undefined;
    render(<NewGame onStart={(game) => (started = game)} />);

    // Pick open first, then switch — the stale choice must not survive.
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Cash and holdings' }),
      'open',
    );
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Edition' }), 'boomtown');
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Start game' }));
      await flush();
    });

    expect(started!.config.edition).toBe('boomtown');
    const view = started!.client.store.getState().views[0]!;
    expect(view.ruleset).toBe(boomtown);
    expect(view.seats[1]?.cash).toBeNull(); // closed, as the ruleset requires
  });
});
