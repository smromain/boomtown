import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Header } from './Header.js';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../settings/settings.js';
import { renderPanel } from '../testing/harness.js';

afterEach(() => {
  localStorage.clear();
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
