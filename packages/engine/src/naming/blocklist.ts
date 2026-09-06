/**
 * Substrings a merged display name must never contain. Concatenating fragments
 * of seven brands will eventually spell something unshippable (`docs/naming.md`:
 * "A blocklist is not optional"), so `displayName` checks each assembled
 * candidate against this list (case-insensitive) and falls back to the next
 * syllable boundary — never to the unblended name.
 *
 * This is a conservative starter list of clearly offensive English roots. A real
 * launch needs a curated, human-reviewed profanity/slur list (and likely
 * localisation); that is an open item in `docs/decisions.md`. A false positive is
 * cheap here — the name just picks a different fragment — so the list errs
 * toward blocking.
 */
export const DEFAULT_BLOCKLIST: readonly string[] = [
  'anal',
  'anus',
  'ballsack',
  'bastard',
  'bitch',
  'bollock',
  'clit',
  'cock',
  'coon',
  'cunt',
  'dick',
  'dildo',
  'dyke',
  'fag',
  'fuck',
  'gook',
  'jizz',
  'kike',
  'nazi',
  'nigg',
  'paki',
  'penis',
  'pussy',
  'queer',
  'rape',
  'retard',
  'scrotum',
  'shit',
  'slut',
  'spic',
  'twat',
  'vagin',
  'wank',
  'whore',
];

/** Whether `name` contains any blocked substring, case-insensitive. */
export function isBlockedName(name: string, blocklist: readonly string[]): boolean {
  const lower = name.toLowerCase();
  return blocklist.some((term) => lower.includes(term));
}
