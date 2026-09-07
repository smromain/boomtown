import type { RulesetId } from '@boomtown/engine';

/**
 * Player-facing names for the two rule sets. Deliberately neutral — the app
 * names no outside game or publisher (see the legal note in CLAUDE.md).
 */
const LABELS: Record<RulesetId, string> = {
  classic: 'Classic',
  'edition-2015': 'Modern',
};

export function editionLabel(id: RulesetId | string): string {
  return LABELS[id as RulesetId] ?? id;
}
