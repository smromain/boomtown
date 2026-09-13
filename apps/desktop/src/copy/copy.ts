import strings from './constants.json';

/**
 * Every word the app says, in one file.
 *
 * `constants.json` is the whole of the interface's copy, keyed by where it
 * appears. Components import from here and never hold a sentence of their own,
 * so revising the writing is a pass through one file rather than a hunt across
 * fifty components — and a phrase used in two places cannot drift into two
 * versions of itself.
 *
 * What is deliberately *not* here: the company names and their flavour lines,
 * which live in `packages/engine` because they are game data the engine deals
 * and the server must agree on, not interface copy; and developer-facing
 * strings (console warnings, debug dumps, test fixtures), which no player ever
 * reads.
 */
export const copy = strings;

/**
 * Fill `{placeholders}` in a string.
 *
 * Copy that names a player, a price or a count has to be one sentence in the
 * JSON rather than three fragments concatenated at the call site — otherwise
 * whoever is revising the words is reading half a sentence and guessing at the
 * rest, and a translation could never reorder it.
 *
 * A placeholder with no value is left as it stands: a visible `{seat}` in the
 * UI is a bug you can see, where an empty gap is one you cannot.
 */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}

/** Pick the singular or the plural, and fill `{n}` with the count. */
export function plural(forms: { readonly one: string; readonly many: string }, n: number): string {
  return fill(n === 1 ? forms.one : forms.many, { n });
}
