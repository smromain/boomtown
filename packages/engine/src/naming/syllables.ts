const VOWELS = 'aeiouy';

/** ASCII letters only. Drops spaces, punctuation, and non-latin glyphs (e.g. the backwards Я). */
export function asciiLetters(name: string): string {
  let out = '';
  for (const ch of name) {
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')) out += ch;
  }
  return out;
}

/**
 * Rough syllable split, ported from `design/build.py` `_syls`: break after a
 * vowel run when the next consonant is followed by a vowel (VCV), or between two
 * consonants that precede a vowel (VCCV). `docs/decisions.md` records that a
 * naive splitter returned whole words — this is the fix.
 */
export function syllables(word: string): string[] {
  const w = word.toLowerCase();
  const out: string[] = [];
  let cur = '';
  let i = 0;
  const isVowel = (c: string | undefined) => c !== undefined && VOWELS.includes(c);

  while (i < w.length) {
    cur += w[i];
    if (isVowel(w[i])) {
      let j = i + 1;
      while (j < w.length && isVowel(w[j])) {
        cur += w[j];
        j++;
      }
      if (j < w.length - 1 && !isVowel(w[j]) && isVowel(w[j + 1])) {
        out.push(cur);
        cur = '';
      } else if (
        j < w.length - 2 &&
        !isVowel(w[j]) &&
        !isVowel(w[j + 1]) &&
        isVowel(w[j + 2])
      ) {
        cur += w[j];
        j++;
        out.push(cur);
        cur = '';
      }
      i = j;
    } else {
      i++;
    }
  }
  if (cur) out.push(cur);
  return out.length > 0 ? out : [w];
}

/** Python's round-half-to-even, so stems match `design/build.py` exactly (e.g. "Noquia" -> "Noqu"). */
export function roundHalfToEven(x: number): number {
  const floor = Math.floor(x);
  const frac = x - floor;
  if (frac < 0.5) return floor;
  if (frac > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}
