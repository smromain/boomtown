import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Header } from './Header.js';
import { musicManager, TRACKS } from '../audio/musicManager.js';
import { ReferenceProvider } from '../reference/ReferenceContext.js';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../settings/settings.js';
import { renderPanel } from '../testing/harness.js';

vi.mock('howler', () => ({
  Howl: vi.fn().mockImplementation(() => {
    let playing = false;
    return {
      play: vi.fn(() => { playing = true; }),
      stop: vi.fn(() => { playing = false; }),
      unload: vi.fn(() => { playing = false; }),
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

describe('Header mute control', () => {
  it('renders in the always-rendered brand region and toggles the persisted setting', async () => {
    const user = userEvent.setup();
    await renderPanel(<Header />);

    const mute = screen.getByRole('button', { name: 'Mute sound' });
    expect(mute).toHaveAttribute('aria-pressed', 'false');

    await user.click(mute);
    expect(screen.getByRole('button', { name: 'Unmute sound' })).toHaveAttribute('aria-pressed', 'true');
    expect(loadSettings().muted).toBe(true);
  });

  it('starts muted when the saved setting says so', async () => {
    saveSettings({ ...DEFAULT_SETTINGS, muted: true });
    await renderPanel(<Header />);
    expect(screen.getByRole('button', { name: 'Unmute sound' })).toBeInTheDocument();
  });
});

describe('Header music control', () => {
  it('names the track it is on and cycles to the next one, persisting the choice', async () => {
    const user = userEvent.setup();
    await renderPanel(<Header />);

    const music = screen.getByRole('button', { name: new RegExp(`Music: ${TRACKS[0]!.title}`) });
    await user.click(music);

    expect(screen.getByRole('button', { name: new RegExp(`Music: ${TRACKS[1]!.title}`) })).toBeInTheDocument();
    expect(loadSettings().musicTrack).toBe(1);
    // the name is said out loud for a moment, since an icon can't tell you
    // which of four tracks the click landed on
    expect(screen.getByText(TRACKS[1]!.title)).toBeInTheDocument();
  });

  it('picks up the remembered track rather than starting over at the first', async () => {
    saveSettings({ ...DEFAULT_SETTINGS, musicTrack: 2 });
    await renderPanel(<Header />);
    expect(
      screen.getByRole('button', { name: new RegExp(`Music: ${TRACKS[2]!.title}`) }),
    ).toBeInTheDocument();
  });

  it('says so when the app is muted — one switch silences music and effects alike', async () => {
    const user = userEvent.setup();
    await renderPanel(<Header />);

    await user.click(screen.getByRole('button', { name: 'Mute sound' }));
    expect(screen.getByRole('button', { name: /Music: .*\(muted\)/ })).toBeInTheDocument();
    expect(musicManager.current()).toBe(TRACKS[0]);
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
