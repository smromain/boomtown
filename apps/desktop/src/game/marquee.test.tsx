import { render, screen } from '@testing-library/react';
import { describe, expect, it, afterEach, vi, type MockInstance } from 'vitest';
import { Marquee } from './Marquee.js';

/**
 * jsdom reports 0 for every layout dimension, so by default a Marquee never
 * detects overflow. These tests stub the size getters to exercise both paths.
 */
const spies: MockInstance[] = [];

function stubSize(scroll: number, client: number, axis: 'x' | 'y') {
  const scrollProp = axis === 'x' ? 'scrollWidth' : 'scrollHeight';
  const clientProp = axis === 'x' ? 'clientWidth' : 'clientHeight';
  spies.push(vi.spyOn(HTMLElement.prototype, scrollProp, 'get').mockReturnValue(scroll));
  spies.push(vi.spyOn(HTMLElement.prototype, clientProp, 'get').mockReturnValue(client));
}

describe('Marquee', () => {
  afterEach(() => {
    for (const spy of spies.splice(0)) spy.mockRestore();
  });

  it('renders the text and does not animate when it fits', () => {
    stubSize(50, 200, 'x');
    render(<Marquee>Short name</Marquee>);
    const viewport = screen.getByText('Short name').parentElement!;
    expect(viewport).not.toHaveAttribute('data-scrolls');
  });

  it('marks itself scrolling when the text overflows horizontally', () => {
    stubSize(400, 120, 'x');
    render(<Marquee>Megahitvilashutvenrun</Marquee>);
    const viewport = screen.getByText('Megahitvilashutvenrun').parentElement!;
    expect(viewport).toHaveAttribute('data-scrolls');
  });

  it('scrolls vertically past a fixed line count', () => {
    stubSize(90, 30, 'y'); // three lines of content, two visible
    render(
      <Marquee axis="y" lines={2}>
        a long blended flavour line that wraps well past two lines of the card
      </Marquee>,
    );
    const viewport = screen.getByText(/long blended flavour/).parentElement!;
    expect(viewport).toHaveAttribute('data-scrolls');
    expect(viewport).toHaveStyle({ '--marquee-lines': '2' });
  });
});
