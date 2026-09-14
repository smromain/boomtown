import { act } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings.js';
import { SettingsDialog } from './SettingsDialog.js';
import { partykitHost } from '../online/hostUrl.js';
import { defaultConfig } from '../setup/gameConfig.js';
import { MUSIC_SOURCE, TRACKS } from '../audio/musicManager.js';
import { copy } from '../copy/copy.js';
import { soundManager } from '../audio/soundManager.js';

vi.mock('howler', () => ({
  Howl: vi.fn().mockImplementation(() => ({
    play: vi.fn(),
    stop: vi.fn(),
    unload: vi.fn(),
    volume: vi.fn(),
    playing: () => false,
  })),
}));

afterEach(() => {
  localStorage.clear();
});

describe('settings store', () => {
  it('returns defaults when nothing is saved', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips a saved value and merges unknown fields onto defaults', () => {
    saveSettings({ ...DEFAULT_SETTINGS, botDifficulty: 9, edition: 'edition-2015' });
    const loaded = loadSettings();
    expect(loaded.botDifficulty).toBe(9);
    expect(loaded.edition).toBe('edition-2015');
    expect(loaded.visibility).toBe('open'); // untouched default
  });

  describe('v1 → v2 migration', () => {
    // A blob written before the Boomtown preset existed. Note what wrote it:
    // muting the sound persists the whole settings object, so almost every
    // install has an edition stored whether or not anyone chose one.
    const v1 = { visibility: 'open', botDifficulty: 5, edition: 'classic', seatCount: 3, partykitHost: '', muted: true, playerName: '' };

    it('drops an edition stored before the choice existed, so the new default lands', () => {
      localStorage.setItem('boomtown.settings', JSON.stringify(v1));
      expect(loadSettings().edition).toBe('boomtown');
      // and only the edition — every other stored preference survives, the
      // v1 mute arriving as the volumes it means (see the later migrations)
      expect(loadSettings().effectsVolume).toBe(0);
      expect(loadSettings().musicVolume).toBe(0);
      expect(loadSettings().seatCount).toBe(3);
    });

    it('leaves a v2 blob alone, so a deliberate Classic choice sticks', () => {
      saveSettings({ ...DEFAULT_SETTINGS, edition: 'classic' });
      expect(loadSettings().edition).toBe('classic');
    });

    it('reaches the new game screen, not just the store', () => {
      localStorage.setItem('boomtown.settings', JSON.stringify(v1));
      expect(defaultConfig().edition).toBe('boomtown');
    });
  });

  it('effects ship at full and music under them (R9)', () => {
    expect(loadSettings().effectsVolume).toBe(1);
    expect(loadSettings().musicVolume).toBe(0.5);
  });

  it('round-trips the two volumes apart from each other', () => {
    saveSettings({ ...DEFAULT_SETTINGS, effectsVolume: 0.35, musicVolume: 0.9 });
    expect(loadSettings().effectsVolume).toBe(0.35);
    expect(loadSettings().musicVolume).toBe(0.9);
  });

  describe('v2 → v3 migration', () => {
    const v2 = (over: Record<string, unknown>) =>
      localStorage.setItem(
        'boomtown.settings',
        JSON.stringify({ ...DEFAULT_SETTINGS, version: 2, ...over }),
      );

    it('reads an old mute as the volumes it meant', () => {
      v2({ muted: true });
      expect(loadSettings().effectsVolume).toBe(0);
      expect(loadSettings().musicVolume).toBe(0);
      v2({ muted: false });
      expect(loadSettings().effectsVolume).toBe(1);
    });

    it('drops a track stored as a position, which reordering made meaningless', () => {
      v2({ musicTrack: 3 });
      expect(loadSettings().musicTrack).toBe(DEFAULT_SETTINGS.musicTrack);
    });

    it('keeps a track already stored as an id', () => {
      v2({ musicTrack: 'azure' });
      expect(loadSettings().musicTrack).toBe('azure');
    });

    it('leaves a current blob alone', () => {
      saveSettings({ ...DEFAULT_SETTINGS, effectsVolume: 0.5, musicTrack: 'green-salon' });
      expect(loadSettings().effectsVolume).toBe(0.5);
      expect(loadSettings().musicTrack).toBe('green-salon');
    });
  });

  describe('v3 → v4 migration', () => {
    it('splits one master volume into the two levels it was producing', () => {
      localStorage.setItem(
        'boomtown.settings',
        JSON.stringify({ ...DEFAULT_SETTINGS, version: 3, volume: 0.6 }),
      );
      // the effects at face value, the music at the half share it used to take
      expect(loadSettings().effectsVolume).toBe(0.6);
      expect(loadSettings().musicVolume).toBeCloseTo(0.3);
    });
  });

  it('a session with no localStorage falls back to defaults without throwing', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: () => {
          throw new Error('no localStorage here');
        },
        setItem: () => {
          throw new Error('no localStorage here');
        },
      },
      configurable: true,
    });
    try {
      expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
      expect(() => saveSettings({ ...DEFAULT_SETTINGS, effectsVolume: 0 })).not.toThrow();
    } finally {
      Object.defineProperty(window, 'localStorage', original);
    }
  });
});

describe('partykitHost', () => {
  it('falls back to localhost:1999 with no override or build var', () => {
    expect(partykitHost()).toBe('localhost:1999');
  });

  it('uses a non-blank Settings override', () => {
    saveSettings({ ...DEFAULT_SETTINGS, partykitHost: '  boomtown.example.partykit.dev  ' });
    expect(partykitHost()).toBe('boomtown.example.partykit.dev');
  });

  it('prefers the baked build var over the localhost fallback', () => {
    vi.stubEnv('VITE_PARTYKIT_HOST', 'baked.partykit.dev');
    expect(partykitHost()).toBe('baked.partykit.dev');
    vi.unstubAllEnvs();
  });

  it('throws in a release build with no host configured (a packaging mistake)', () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_PARTYKIT_HOST', '');
    expect(() => partykitHost()).toThrow(/No online host is configured/);
    // an override still works even in that broken build
    saveSettings({ ...DEFAULT_SETTINGS, partykitHost: 'rescue.partykit.dev' });
    expect(partykitHost()).toBe('rescue.partykit.dev');
    vi.unstubAllEnvs();
  });
});

describe('defaultConfig seeded from settings', () => {
  it('takes seat count, edition, visibility and bot difficulty from saved settings', () => {
    saveSettings({
      ...DEFAULT_SETTINGS,
      seatCount: 5,
      edition: 'edition-2015',
      visibility: 'hidden',
      botDifficulty: 8,
    });
    const config = defaultConfig();
    expect(config.seats).toHaveLength(5);
    expect(config.edition).toBe('edition-2015');
    expect(config.visibility).toBe('hidden');
    expect(config.seats[0]!.difficulty).toBe(8);
  });
});

describe('SettingsDialog sound levels', () => {
  it('sets the levels the app loads at, separately, saying "off" at the bottom', async () => {
    render(<SettingsDialog open onClose={() => {}} />);

    const effects = screen.getByRole('slider', { name: 'Sound effect volume' });
    const music = screen.getByRole('slider', { name: 'Music volume' });
    expect(effects).toHaveValue('100');
    expect(music).toHaveValue('50');

    fireEvent.change(effects, { target: { value: '0' } });
    expect(screen.getByText(/Sound effects: off/i)).toBeInTheDocument();

    fireEvent.change(music, { target: { value: '45' } });
    expect(screen.getByText('Music: 45%')).toBeInTheDocument();

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    expect(loadSettings().effectsVolume).toBe(0);
    expect(loadSettings().musicVolume).toBeCloseTo(0.45);
  });

  it('shows the levels as they stand now, not as they stood when the app started', () => {
    // The dialog is mounted for the whole session, so a draft seeded once would
    // hand back stale levels — and Save would undo whatever the header's
    // sliders did during a game.
    const { rerender } = render(<SettingsDialog open={false} onClose={() => {}} />);
    saveSettings({ ...DEFAULT_SETTINGS, effectsVolume: 0.2, musicVolume: 0.1 });

    rerender(<SettingsDialog open onClose={() => {}} />);
    expect(screen.getByRole('slider', { name: 'Sound effect volume' })).toHaveValue('20');
    expect(screen.getByRole('slider', { name: 'Music volume' })).toHaveValue('10');
  });

  it('a level set here is what a fresh load reads', () => {
    render(<SettingsDialog open onClose={() => {}} />);
    fireEvent.change(screen.getByRole('slider', { name: 'Sound effect volume' }), {
      target: { value: '15' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(soundManager.volume()).toBeCloseTo(0.15);
  });
});

describe('SettingsDialog music credits', () => {
  it('credits every track it can play, and says where they came from', () => {
    render(<SettingsDialog open onClose={() => {}} />);

    const credits = screen.getByRole('region', { name: 'Music credits' });
    for (const track of TRACKS) {
      expect(credits).toHaveTextContent(track.title);
      expect(credits).toHaveTextContent(track.credit);
    }
    expect(credits).toHaveTextContent(MUSIC_SOURCE);
  });
});

describe('SettingsDialog', () => {
  it('saves the edited preferences and closes', async () => {
    const onClose = () => {};
    let closed = false;
    render(<SettingsDialog open onClose={() => (closed = true)} />);

await userEvent.click(
      within(screen.getByRole('radiogroup', { name: /cash and holdings/i })).getByRole('radio', { name: 'Closed books' }),
    );
    await userEvent.type(screen.getByRole('textbox', { name: 'Online host' }), 'my.partykit.dev');
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    expect(closed).toBe(true);
    expect(loadSettings().visibility).toBe('hidden');
    expect(loadSettings().partykitHost).toBe('my.partykit.dev');
    void onClose;
  });

  it('Reset restores the defaults in the form', async () => {
    saveSettings({ ...DEFAULT_SETTINGS, partykitHost: 'stale.example.dev' });
    render(<SettingsDialog open onClose={() => {}} />);
    expect(screen.getByRole('textbox', { name: 'Online host' })).toHaveValue('stale.example.dev');
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByRole('textbox', { name: 'Online host' })).toHaveValue('');
  });

  it('has no debug section when onDebugTrigger is not given (e.g. a release build with the prop omitted)', () => {
    render(<SettingsDialog open onClose={() => {}} />);
    expect(screen.queryByText(copy.settings.debug.heading)).not.toBeInTheDocument();
  });

  it('offers one button per beat and calls onDebugTrigger, closing itself', async () => {
    const onDebugTrigger = vi.fn();
    const onClose = vi.fn();
    render(<SettingsDialog open onClose={onClose} onDebugTrigger={onDebugTrigger} />);

    // Names from the copy file: what these previews are called is a copy
    // decision, while *one button per beat* is the behaviour under test.
    const debug = copy.settings.debug;
    for (const label of [
      debug.founding,
      debug.buyStock,
      debug.mergerTwo,
      debug.mergerThree,
      debug.endgame,
      debug.victory,
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }

    // The merger beat has two scenarios, because a single-chain fixture cannot
    // exercise a multi-chain absorption — the shape that was broken.
    await userEvent.click(screen.getByRole('button', { name: copy.settings.debug.mergerThree }));
    expect(onDebugTrigger).toHaveBeenCalledWith('merger-three-way');
    expect(onClose).toHaveBeenCalledOnce();
  });
});
