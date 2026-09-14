import { Fragment, type ReactNode } from 'react';

/**
 * Copy with emphasis in it, rendered from one string.
 *
 * The rules read as prose — "**Place a tile.** Mandatory if any tile in hand
 * can be played" — and prose is what someone revising the words wants to see.
 * Splitting each sentence into a `<strong>` and three text nodes would put the
 * writing back in the components in all but name, and leave the JSON holding
 * fragments nobody can read.
 *
 * So the JSON keeps the sentence whole, with the two marks the copy actually
 * uses: `**bold**` and `*italic*`. Deliberately not a markdown library — no
 * links, lists or headings, because copy that wants those wants a different
 * home, and a parser this small can be read in one sitting.
 */
const TOKEN = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;

export function rich(text: string): ReactNode[] {
  return text.split(TOKEN).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

/** The same, as a component, for the common case of a whole paragraph. */
export function Rich({ text }: { text: string }) {
  return <>{rich(text)}</>;
}
