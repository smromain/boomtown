import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App.js';

describe('App shell', () => {
  it('mounts and shows the new-game screen', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'New game' }).tagName).toBe('H1');
  });
});
