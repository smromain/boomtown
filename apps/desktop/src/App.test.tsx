import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App.js';

describe('App shell', () => {
  it('mounts and renders the title', () => {
    render(<App />);
    // getByRole throws if the element is absent, so this is the assertion
    expect(screen.getByRole('heading', { name: 'Boomtown' }).tagName).toBe('H1');
  });
});
