import { act } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings.js';
import { SettingsDialog } from './SettingsDialog.js';
import { partykitHost } from '../online/hostUrl.js';
import { defaultConfig } from '../setup/gameConfig.js';

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

describe('SettingsDialog', () => {
  it('saves the edited preferences and closes', async () => {
    const onClose = () => {};
    let closed = false;
    render(<SettingsDialog open onClose={() => (closed = true)} />);

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /cash and holdings/i }),
      'hidden',
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
});
