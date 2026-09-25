import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Header } from './Header.js';
import { musicManager, TRACKS } from '../audio/musicManager.js';
import { soundManager } from '../audio/soundManager.js';
import { ReferenceProvider } from '../reference/ReferenceContext.js';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../settings/settings.js';
import { renderPanel } from '../testing/harness.js';
import { getBoardPrefs, resetBoardPrefsForTests } from '../board/boardPrefs.js';

vi.mock('howler', () => ({
  Howl: vi.fn().mockImplementation(() => {
    let playing = false;
    return {
      play: vi.fn(() => { playing = true; }),
      stop: vi.fn(() => { playing = false; }),
      unload: vi.fn(() => { playing = false; }),
      volume: vi.fn(),
      playing: () => playing,
    };
  }),
}));

/** The header wired to its reference modals, the way `GameScreen` mounts it. */
const withReference = (
  <ReferenceProvider>
    <Header />
  </ReferenceProvider>
);

afterEach(() => {
  musicManager.release();
  localStorage.clear();
  vi.clearAllMocks();
});

describe('Header volume controls', () => {
  it('opens a slider each for the effects and the music, set independently', async () => {
    const user = userEvent.setup();
    await renderPanel(<Header />);

    const speaker = screen.getByRole('button', { name: 'Volume' });
    expect(speaker).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('slider', { name: 'Sound effect volume' })).not.toBeInTheDocument();

    await user.click(speaker);
    const effects = screen.getByRole('slider', { name: 'Sound effect volume' });
    const music = screen.getByRole('slider', { name: 'Music volume' });
    // music starts lower — a soundtrack sits under the effects, but only to start
    expect(effects).toHaveValue('100');
    expect(music).toHaveValue('50');

    fireEvent.change(effects, { target: { value: '40' } });
    expect(loadSettings().effectsVolume).toBeCloseTo(0.4);
    expect(loadSettings().musicVolume).toBeCloseTo(0.5); // untouched

    fireEvent.change(music, { target: { value: '90' } });
    expect(loadSettings().musicVolume).toBeCloseTo(0.9);
    expect(loadSettings().effectsVolume).toBeCloseTo(0.4); // still untouched
  });

  it('crosses out the speaker when the effects hit zero', async () => {
    const user = userEvent.setup();
    await renderPanel(<Header />);

    await user.click(screen.getByRole('button', { name: 'Volume' }));
    fireEvent.change(screen.getByRole('slider', { name: 'Sound effect volume' }), {
      target: { value: '0' },
    });

    expect(soundManager.isMuted()).toBe(true);
    // and the music, which has its own slider, plays on
    expect(loadSettings().musicVolume).toBeGreaterThan(0);
  });

  it('starts from the saved levels, and puts the sliders away again on a second click', async () => {
    saveSettings({ ...DEFAULT_SETTINGS, effectsVolume: 0.25, musicVolume: 0.75 });
    const user = userEvent.setup();
    await renderPanel(<Header />);

    await user.click(screen.getByRole('button', { name: 'Volume' }));
    expect(screen.getByRole('slider', { name: 'Sound effect volume' })).toHaveValue('25');
    expect(screen.getByRole('slider', { name: 'Music volume' })).toHaveValue('75');

    await user.click(screen.getByRole('button', { name: 'Volume' }));
    expect(screen.queryByRole('slider', { name: 'Music volume' })).not.toBeInTheDocument();
  });
});

describe('Header music controls', () => {
  it('skips forward and back through the tracks, wrapping in both directions', async () => {
    const user = userEvent.setup();
    await renderPanel(<Header />);

    expect(screen.getByRole('button', { name: `Mute music — ${TRACKS[0]!.title}` })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next track' }));
    expect(screen.getByRole('button', { name: `Mute music — ${TRACKS[1]!.title}` })).toBeInTheDocument();
    expect(loadSettings().musicTrack).toBe(TRACKS[1]!.id);
    // the arrows say what they landed on — the icon can't
    expect(screen.getByText(TRACKS[1]!.title)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Previous track' }));
    expect(screen.getByRole('button', { name: `Mute music — ${TRACKS[0]!.title}` })).toBeInTheDocument();

    // back past the first lands on the last rather than sticking
    await user.click(screen.getByRole('button', { name: 'Previous track' }));
    expect(
      screen.getByRole('button', { name: `Mute music — ${TRACKS.at(-1)!.title}` }),
    ).toBeInTheDocument();
  });

  it('turns the music off and on again, persisting it', async () => {
    const user = userEvent.setup();
    await renderPanel(<Header />);

    const music = screen.getByRole('button', { name: `Mute music — ${TRACKS[0]!.title}` });
    expect(music).toHaveAttribute('aria-pressed', 'false');

    await user.click(music);
    const off = screen.getByRole('button', { name: `Unmute music — ${TRACKS[0]!.title}` });
    expect(off).toHaveAttribute('aria-pressed', 'true');
    expect(loadSettings().musicMuted).toBe(true);

    await user.click(off);
    expect(loadSettings().musicMuted).toBe(false);
  });

  it('swaps the note for heroicons\' no-symbol when the music is off, the way the speaker swaps too', async () => {
    const user = userEvent.setup();
    await renderPanel(<Header />);

    const music = screen.getByRole('button', { name: /^Mute music/ });
    const note = music.innerHTML;
    expect(music.querySelector('svg')).toBeInTheDocument();

    await user.click(music);
    const off = screen.getByRole('button', { name: /^Unmute music/ });
    // a different icon, and still an icon — not an empty button or a CSS trick
    expect(off.innerHTML).not.toBe(note);
    expect(off.querySelector('svg')).toBeInTheDocument();
  });

  it('is its own switch: turning the music off leaves both volumes where they were', async () => {
    const user = userEvent.setup();
    await renderPanel(<Header />);

    await user.click(screen.getByRole('button', { name: /^Mute music/ }));
    expect(loadSettings().musicMuted).toBe(true);
    expect(loadSettings().musicVolume).toBe(DEFAULT_SETTINGS.musicVolume);
    expect(loadSettings().effectsVolume).toBe(DEFAULT_SETTINGS.effectsVolume);
  });

  it('picks up the remembered track rather than starting over at the first', async () => {
    saveSettings({ ...DEFAULT_SETTINGS, musicTrack: TRACKS[2]!.id });
    await renderPanel(<Header />);
    expect(screen.getByRole('button', { name: `Mute music — ${TRACKS[2]!.title}` })).toBeInTheDocument();
  });
});

describe('Header reference controls', () => {
  it('offers both Reference and Rules, and each opens its modal', async () => {
    const user = userEvent.setup();
    await renderPanel(withReference);

    await user.click(screen.getByRole('button', { name: 'Reference' }));
    expect(await screen.findByRole('dialog', { name: 'Stock reference' })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Rules' }));
    expect(await screen.findByRole('dialog', { name: 'How to play' })).toBeInTheDocument();
  });

  it('keeps both reachable online while a remote player is on the clock (#14)', async () => {
    // The online shape: this client holds a view for its own seat only, and
    // seat 1 is on the clock. `activeView` is null throughout — the whole
    // status block used to disappear with it, reference button included.
    const user = userEvent.setup();
    await renderPanel(withReference, {
      controls: [0],
      localSeats: [0],
      craft: (state) => {
        state.turnPointer = 1;
      },
    });

    expect(screen.getByRole('button', { name: 'Reference' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rules' })).toBeInTheDocument();
    expect(screen.getByText(/Turn/)).toBeInTheDocument();

    // ...and they still work, rather than merely being on screen.
    await user.click(screen.getByRole('button', { name: 'Rules' }));
    expect(await screen.findByRole('dialog', { name: 'How to play' })).toBeInTheDocument();
  });

  it('stands the phase readout down on a turn that is not yours, and shows it on one that is', async () => {
    // Online: no view for the seat on the clock at all.
    const remote = await renderPanel(withReference, {
      controls: [0],
      localSeats: [0],
      craft: (state) => {
        state.turnPointer = 1;
      },
    });
    expect(screen.queryByText('Place a tile')).not.toBeInTheDocument();
    remote.unmount();

    // Hot-seat with a bot on the clock: the client holds a view for *every*
    // seat, so the phase has to be gated on the turn being local, not on a
    // view existing. Otherwise an accent "Place a tile" badge sits in the
    // header telling a player to move while a bot is playing.
    const bot = await renderPanel(withReference, {
      localSeats: [0, 2],
      craft: (state) => {
        state.turnPointer = 1;
      },
    });
    expect(screen.queryByText('Place a tile')).not.toBeInTheDocument();
    bot.unmount();

    await renderPanel(withReference, { controls: [0], localSeats: [0] });
    expect(screen.getByText('Place a tile')).toBeInTheDocument();
  });
});

describe('leaving the game from the header (#73)', () => {
  const withExit = (onExit: () => void, online = false) => (
    <ReferenceProvider>
      <Header onExit={onExit} online={online} />
    </ReferenceProvider>
  );

  it('offers no way out when there is nowhere to go', async () => {
    await renderPanel(withReference);
    expect(screen.queryByRole('button', { name: 'Leave the game' })).not.toBeInTheDocument();
  });

  it('asks before leaving, and stays put if you say no', async () => {
    const onExit = vi.fn();
    await renderPanel(withExit(onExit));
    await userEvent.click(screen.getByRole('button', { name: 'Leave the game' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // The speedbump is the point: one click must not end the game.
    expect(onExit).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Stay at the table' }));
    expect(onExit).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('leaves once you confirm', async () => {
    const onExit = vi.fn();
    await renderPanel(withExit(onExit));
    await userEvent.click(screen.getByRole('button', { name: 'Leave the game' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Leave the game' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('says what leaving costs, and it is not the same thing online', async () => {
    // Locally the table is gone; online the room holds the seat. Telling a
    // player the wrong one of those is worse than telling them neither.
    const local = await renderPanel(withExit(vi.fn(), false));
    await userEvent.click(screen.getByRole('button', { name: 'Leave the game' }));
    expect(screen.getByRole('dialog')).toHaveTextContent(/ends the game/i);
    expect(screen.getByRole('dialog')).not.toHaveTextContent(/seat is held/i);
    local.unmount();

    await renderPanel(withExit(vi.fn(), true));
    await userEvent.click(screen.getByRole('button', { name: 'Leave the game' }));
    expect(screen.getByRole('dialog')).toHaveTextContent(/seat is held/i);
    expect(screen.getByRole('dialog')).not.toHaveTextContent(/ends the game/i);
  });

  it('is in the always-rendered brand region, not the view-gated status block', async () => {
    // The moment you most want out is the moment the table may be broken, and
    // the status block only renders once there is a view.
    await renderPanel(withExit(vi.fn()));
    const exit = screen.getByRole('button', { name: 'Leave the game' });
    expect(exit.closest('[class*="brand"]')).not.toBeNull();
    expect(exit.closest('[class*="status"]')).toBeNull();
  });
});

describe('Header board switch (#70)', () => {
  afterEach(() => resetBoardPrefsForTests());

  it('flips between Board View and Skyline in one click, and remembers it on this machine', async () => {
    const user = userEvent.setup();
    await renderPanel(<Header />);
    await user.click(screen.getByRole('button', { name: 'Switch to Skyline' }));
    expect(loadSettings().boardStyle).toBe('skyline');
    expect(getBoardPrefs().chosen).toBe('skyline');
    await user.click(screen.getByRole('button', { name: 'Switch to Board View' }));
    expect(loadSettings().boardStyle).toBe('board-view');
  });
});
