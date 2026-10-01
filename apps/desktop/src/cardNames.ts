import type { Ruleset } from '@boomtown/engine';

/**
 * Corporation-card naming experiments (design exercise). Read once from the URL,
 * the way `skin.ts` reads `?skin=`, so the variants can be compared side by side:
 *
 *   ?names=joined       whole names juxtaposed, Keurig Dr Pepper style
 *   ?names=joined-ltd   the same, with "Ltd." once merged
 *   ?taglines=joined    every flavour line kept whole, not spliced
 *   ?fit=wrap           the card wraps its name and flavour instead of scrolling them
 *
 * The first two change the ruleset a new local game is dealt with, so every
 * screen that names a corporation follows; `fit` is the card alone.
 */
export interface CardNaming {
  readonly names: 'portmanteau' | 'joined' | 'joined-ltd';
  readonly taglines: 'blend' | 'join';
  readonly fit: 'marquee' | 'wrap';
}

function read(): CardNaming {
  if (typeof window === 'undefined' || import.meta.env.MODE === 'test') {
    return { names: 'portmanteau', taglines: 'blend', fit: 'marquee' };
  }
  const q = new URLSearchParams(window.location.search);
  const names = q.get('names');
  return {
    names: names === 'joined' || names === 'joined-ltd' ? names : 'portmanteau',
    taglines: q.get('taglines') === 'joined' ? 'join' : 'blend',
    fit: q.get('fit') === 'wrap' ? 'wrap' : 'marquee',
  };
}

export const cardNaming: CardNaming = read();

/** The ruleset with the chosen naming experiment applied; untouched when none is. */
export function withCardNaming(ruleset: Ruleset): Ruleset {
  if (cardNaming.names === 'portmanteau' && cardNaming.taglines === 'blend') return ruleset;
  return {
    ...ruleset,
    mergeNaming: { ...ruleset.mergeNaming, style: cardNaming.names, flavourStyle: cardNaming.taglines },
  };
}

export function applyCardNaming(root: HTMLElement = document.documentElement): void {
  root.dataset.cardFit = cardNaming.fit;
}
