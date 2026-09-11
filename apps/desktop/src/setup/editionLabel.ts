import type { RulesetId } from '@boomtown/engine';

/**
 * Player-facing names for the rule sets. Deliberately neutral — the app names no
 * outside game or publisher (see the legal note in CLAUDE.md).
 *
 * `Boomtown` is short on purpose. This label lands in a small-caps chip in the
 * header beside the turn counter, where a long name is several times the width
 * of the others; the game's own name is the right one for the game's own
 * ruleset anyway.
 */
const LABELS: Record<RulesetId, string> = {
  classic: 'Classic',
  'edition-2015': 'Modern',
  boomtown: 'Boomtown',
};

export function editionLabel(id: RulesetId | string): string {
  return LABELS[id as RulesetId] ?? id;
}
