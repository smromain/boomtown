import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { copy, fill, plural } from './copy.js';
import { Rich } from './Rich.js';

describe('fill', () => {
  it('puts values into their placeholders', () => {
    expect(fill('{name} holds {n}', { name: 'Ana', n: 3 })).toBe('Ana holds 3');
  });

  it('fills a placeholder used more than once', () => {
    expect(fill('{corp} eats {other}. {corp} carries on.', { corp: 'A', other: 'B' })).toBe(
      'A eats B. A carries on.',
    );
  });

  it('leaves an unfilled placeholder visible rather than blanking it', () => {
    // A visible {seat} in the UI is a bug you can see; an empty gap is one you
    // cannot, and it would reach a player as a missing word.
    expect(fill('{name} moved', {})).toBe('{name} moved');
  });

  it('does not treat a value as a template of its own', () => {
    expect(fill('{a}', { a: '{b}' })).toBe('{b}');
  });
});

describe('plural', () => {
  it('picks the form that matches the count', () => {
    const shares = { one: '{n} share', many: '{n} shares' };
    expect(plural(shares, 1)).toBe('1 share');
    expect(plural(shares, 4)).toBe('4 shares');
    expect(plural(shares, 0)).toBe('0 shares');
  });
});

describe('Rich', () => {
  it('renders **bold** and *italic* as emphasis, and leaves the rest as text', () => {
    render(
      <p data-testid="line">
        <Rich text="**Place a tile.** It may *found* a corporation." />
      </p>,
    );
    const line = screen.getByTestId('line');
    expect(line).toHaveTextContent('Place a tile. It may found a corporation.');
    expect(line.querySelector('strong')).toHaveTextContent('Place a tile.');
    expect(line.querySelector('em')).toHaveTextContent('found');
  });

  it('leaves a lone asterisk alone — copy is allowed to contain one', () => {
    render(
      <p data-testid="line">
        <Rich text="2 * 3 is six" />
      </p>,
    );
    expect(screen.getByTestId('line')).toHaveTextContent('2 * 3 is six');
    expect(screen.getByTestId('line').querySelector('em')).toBeNull();
  });
});

describe('constants.json', () => {
  const walk = (node: unknown, path: string, visit: (path: string, value: string) => void): void => {
    if (typeof node === 'string') return visit(path, node);
    if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) walk(value, path ? `${path}.${key}` : key, visit);
    }
  };

  it('holds only non-empty strings', () => {
    const empty: string[] = [];
    walk(copy, '', (path, value) => {
      if (value.trim() === '') empty.push(path);
    });
    expect(empty).toEqual([]);
  });

  it('has no placeholder left half-written', () => {
    // `{n` or a stray `}` is the typo this file invites, and it reaches a
    // player as literal punctuation in a sentence.
    const broken: string[] = [];
    walk(copy, '', (path, value) => {
      const opens = (value.match(/\{/g) ?? []).length;
      const closes = (value.match(/\}/g) ?? []).length;
      if (opens !== closes) broken.push(`${path}: ${value}`);
    });
    expect(broken).toEqual([]);
  });

  it('closes every emphasis mark it opens', () => {
    const unbalanced: string[] = [];
    walk(copy, '', (path, value) => {
      const bold = (value.match(/\*\*/g) ?? []).length;
      const stars = (value.match(/\*/g) ?? []).length - bold * 2;
      if (bold % 2 !== 0 || stars % 2 !== 0) unbalanced.push(`${path}: ${value}`);
    });
    expect(unbalanced).toEqual([]);
  });
});
