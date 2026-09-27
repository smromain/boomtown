import { act } from 'react';
import { render, screen, within } from '@testing-library/react';
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

    await userEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Seats' })).getByRole('radio', { name: '5 seats' }),
    );
    await userEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Seat 4 type' })).getByRole('radio', { name: 'Bot' }),
    );
    await userEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Seat 5 type' })).getByRole('radio', { name: 'Bot' }),
    );
    await userEvent.click(screen.getByRole('radio', { name: /Modern/ }));
    await userEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Cash and holdings' })).getByRole('radio', { name: 'Closed — only your own' }),
    );

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
    await userEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Seat 1 type' })).getByRole('radio', { name: 'Bot' }),
    );
    await userEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Seat 2 type' })).getByRole('radio', { name: 'Bot' }),
    );

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
    await userEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Seat 1 type' })).getByRole('radio', { name: 'Bot' }),
    );
    await userEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Seat 2 type' })).getByRole('radio', { name: 'Bot' }),
    );

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
    await userEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Seat 2 type' })).getByRole('radio', { name: 'Bot' }),
    );

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

  it('keeps the rules out of the screen until asked, then covers both rule sets', async () => {
    render(<NewGame onStart={() => {}} />);

    // Nothing of the prose is in the page until the button is pressed. It used
    // to be an inline <details>, and expanded it was taller than the smallest
    // window the app allows — a control on the screen could push the screen
    // itself into a scroll.
    expect(screen.queryByText(/A turn/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'How to play' }));
    const rules = screen.getByRole('dialog');
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

  it('seals the visibility control and says why', async () => {
    // Boomtown is the default preset, so the setting starts sealed — the
    // direction of this test is reversed from when Classic was the default.
    render(<NewGame onStart={() => {}} />);
    // No picker at all, rather than a greyed-out one: a disabled control reads
    // as something broken and invites a click that does nothing.
    expect(screen.queryByRole('radiogroup', { name: 'Cash and holdings' })).not.toBeInTheDocument();
    expect(screen.getByText('Closed books')).toBeInTheDocument();
    // Anchored on the field note, not on "books closed" alone: the how-to-play
    // summary explains the same rule, and a bare text match would find that
    // instead of the setting's own explanation.
    expect(screen.getByText(/the ruleset fixes this/i)).toBeInTheDocument();

    // and it is a preset rule, not a permanent one — the published editions
    // leave visibility to the table
    await userEvent.click(screen.getByRole('radio', { name: /Classic/ }));
    expect(screen.getByRole('radiogroup', { name: 'Cash and holdings' })).toBeInTheDocument();
    expect(screen.queryByText(/the ruleset fixes this/i)).not.toBeInTheDocument();
  });

  it('names the visibility control without swallowing its explanation', async () => {
    // The note used to live inside the control's own <label>, so the
    // accessible name absorbed it: "Cash and holdings Boomtown is played with
    // the books closed — the ruleset fixes this." It is a sibling now, and the
    // group carries its own name.
    render(<NewGame onStart={() => {}} />);
    await userEvent.click(screen.getByRole('radio', { name: /Classic/ }));
    const visibility = screen.getByRole('radiogroup', { name: 'Cash and holdings' });
    expect(visibility).toHaveAccessibleName('Cash and holdings');
  });

  it('deals a closed-book table even when open was picked before switching preset', async () => {
    let started: StartedGame | undefined;
    render(<NewGame onStart={(game) => (started = game)} />);

    // Drop to a preset that permits an open table, pick open, then switch back
    // — the stale choice must not survive.
    await userEvent.click(screen.getByRole('radio', { name: /Classic/ }));
    await userEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Cash and holdings' })).getByRole('radio', {
        name: 'Open — everyone sees everything',
      }),
    );
    await userEvent.click(screen.getByRole('radio', { name: /Boomtown/ }));
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

describe('the edition cards', () => {
  it('takes every number from the ruleset presets, so the screen cannot drift from the engine', () => {
    render(<NewGame onStart={() => {}} />);

    const card = (name: RegExp) => screen.getByRole('radio', { name });
    expect(card(/Classic/)).toHaveTextContent(`safe at ${classic.safeSize}`);
    expect(card(/Classic/)).toHaveTextContent(`ends at ${classic.endChainSize}`);
    expect(card(/Modern/)).toHaveTextContent(`safe at ${edition2015.safeSize}`);
    expect(card(/Modern/)).toHaveTextContent(`${edition2015.bonusTiers} bonus tiers`);
  });

  it('says what Boomtown adds, because its numbers are Classic’s', () => {
    render(<NewGame onStart={() => {}} />);
    // Same safe size, same end size, same tiers: without the extras line the
    // default would look like an arbitrary duplicate of the Classic card.
    expect(boomtown.safeSize).toBe(classic.safeSize);
    expect(screen.getByRole('radio', { name: /Boomtown/ })).toHaveTextContent(
      /closed books · a vote can end it early/,
    );
    expect(screen.getByRole('radio', { name: /Classic/ })).not.toHaveTextContent(/closed books/);
  });

  it('starts on Boomtown and switches on a click', async () => {
    render(<NewGame onStart={() => {}} />);
    expect(screen.getByRole('radio', { name: /Boomtown/ })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: /Modern/ }));
    expect(screen.getByRole('radio', { name: /Modern/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Boomtown/ })).not.toBeChecked();
  });
});
