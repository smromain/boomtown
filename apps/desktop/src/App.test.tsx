import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from './App.js';

describe('App shell', () => {
  it('mounts on the main menu with local and online choices', () => {
    render(<App />);
    expect(screen.getByRole('img', { name: 'Boomtown' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Local game' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play online' })).toBeInTheDocument();
  });

  it('goes to local setup on "Local game" and back to the menu on "Back"', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Local game' }));
    expect(screen.getByRole('heading', { name: 'New game' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('img', { name: 'Boomtown' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Local game' })).toBeInTheDocument();
  });

  it('goes to the online create/join screen on "Play online"', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Play online' }));
    expect(screen.getByRole('heading', { name: 'Play online' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create a room' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join with a code' })).toBeInTheDocument();
  });
});
