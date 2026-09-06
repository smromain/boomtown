import { DEFAULT_BLOCKLIST, isBlockedName } from './blocklist.js';
import { asciiLetters, roundHalfToEven, syllables } from './syllables.js';

export { syllables, asciiLetters } from './syllables.js';
export { DEFAULT_BLOCKLIST, isBlockedName } from './blocklist.js';

export interface MergeNamingConfig {
  readonly enabled: boolean;
  /** Share of the base name kept, from the front, computed once at founding. */
  readonly stem: number;
  readonly minFragment: number;
  readonly maxFragment: number;
  readonly collapseSeam: boolean;
  /** Substrings an assembled display name must never contain (`docs/naming.md`). */
  readonly blocklist: readonly string[];
}

export const DEFAULT_MERGE_NAMING: MergeNamingConfig = {
  enabled: true,
  stem: 0.75,
  minFragment: 3,
  maxFragment: 6,
  collapseSeam: true,
  blocklist: DEFAULT_BLOCKLIST,
};

/**
 * A corporation the survivor absorbed. `displayName` is the eaten corporation's
 * display name at the moment of absorption (so nested history is captured), and
 * `flavours` is its own flavour plus everything it had itself eaten.
 */
export interface EatenRecord {
  readonly displayName: string;
  readonly flavours: readonly string[];
}

/** The part of a corporation's own name it keeps forever. Computed once, from the base name. */
export function stem(baseName: string, config: MergeNamingConfig = DEFAULT_MERGE_NAMING): string {
  const letters = asciiLetters(baseName);
  const keep = Math.max(2, roundHalfToEven(config.stem * letters.length));
  const head = letters.slice(0, keep);
  return head.charAt(0).toUpperCase() + head.slice(1).toLowerCase();
}

/** Progressive fragment candidates for the tail of a name: last syllable, last two, ... */
export function fragmentCandidates(
  name: string,
  config: MergeNamingConfig = DEFAULT_MERGE_NAMING,
): string[] {
  const words = name
    .split(/[^A-Za-zЀ-ӿ]+/)
    .map((w) => asciiLetters(w))
    .filter((w) => w.length > 1);

  if (words.length === 0) {
    return [asciiLetters(name).slice(-config.minFragment).toLowerCase()];
  }

  const syls = syllables(words[words.length - 1]!);
  const candidates: string[] = [];
  for (let k = 1; k <= syls.length; k++) {
    candidates.push(syls.slice(syls.length - k).join('').slice(-config.maxFragment));
  }
  return candidates;
}

/** The fragment a corporation leaves behind when swallowed: the tail of its last real word. */
export function fragment(name: string, config: MergeNamingConfig = DEFAULT_MERGE_NAMING): string {
  const candidates = fragmentCandidates(name, config);
  let chosen = candidates[0]!;
  for (const candidate of candidates) {
    chosen = candidate;
    if (candidate.length >= config.minFragment) break;
  }
  return chosen;
}

function join(head: string, frag: string, config: MergeNamingConfig): string {
  let f = frag;
  if (config.collapseSeam && head && f && head[head.length - 1]!.toLowerCase() === f[0]!.toLowerCase()) {
    f = f.slice(1);
  }
  return head + f;
}

/**
 * The derived display name: the stem plus one fragment for every corporation
 * absorbed, in acquisition order. Never stored (R6). When `enabled` is false the
 * survivor keeps its own name.
 *
 * Every assembled candidate is checked against `config.blocklist` (or an
 * explicit `isBlocked` override); a blocked result falls back to the next
 * syllable boundary for that fragment, never to the unblended name.
 */
export function displayName(
  baseName: string,
  eaten: readonly EatenRecord[],
  config: MergeNamingConfig = DEFAULT_MERGE_NAMING,
  isBlocked: (name: string) => boolean = (name) => isBlockedName(name, config.blocklist),
): string {
  if (!config.enabled || eaten.length === 0) return baseName;

  let head = stem(baseName, config);
  for (const record of eaten) {
    // Try the shortest fragment first, then widen a syllable at a time until one
    // is long enough and the assembled name is not blocked.
    const candidates = fragmentCandidates(record.displayName, config);
    let next = join(head, candidates[0]!, config);
    for (const candidate of candidates) {
      next = join(head, candidate, config);
      if (candidate.length >= config.minFragment && !isBlocked(next)) break;
    }
    head = next;
  }
  return head;
}

/** The survivor inherits every flavour line it swallowed, in order. */
export function accretedFlavour(ownFlavour: string, eaten: readonly EatenRecord[]): string[] {
  return [ownFlavour, ...eaten.flatMap((record) => record.flavours)];
}
