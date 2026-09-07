import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from './App.js';

describe('App shell', () => {
  it('mounts on the main menu with local and online choices', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Boomtown' }).tagName).toBe('H1');
    expect(screen.getByRole('button', { name: 'Local game' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play online' })).toBeInTheDocument();
  });

  it('goes to local setup on "Local game"', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Local game' }));
    expect(screen.getByRole('heading', { name: 'New game' })).toBeInTheDocument();
  });

  it('goes to the online create/join screen on "Play online"', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Play online' }));
    expect(screen.getByRole('heading', { name: 'Play online' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create a room' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join with a code' })).toBeInTheDocument();
  });
});
