import { PRESETS, type RulesetId } from '@boomtown/engine';
import { editionLabel } from './editionLabel.js';
import styles from './form.module.css';

/**
 * The edition picker, shared by New game and Play online.
 *
 * It is three cards rather than a `<select>` because this is the most
 * consequential choice on the screen — it moves safe size, the end trigger,
 * the bonus tiers and, for Boomtown, whether the books are open at all — and a
 * dropdown showing a single word ("Boomtown") tells a first-time player none of
 * that. The cards say what each set *is* at the moment of choosing, which is
 * also the only moment anyone is asking.
 *
 * The summary line is built from the presets, not written out, so it cannot
 * drift from the engine: change `safeSize` and this screen changes with it.
 */
const ORDER: readonly RulesetId[] = ['boomtown', 'classic', 'edition-2015'];

export function editionSummary(id: RulesetId): string {
  const ruleset = PRESETS[id];
  return [
    `safe at ${ruleset.safeSize}`,
    `ends at ${ruleset.endChainSize}`,
    `${ruleset.bonusTiers} bonus tiers`,
  ].join(' · ');
}

/**
 * What this set adds on top of the numbers. Classic and Modern differ from one
 * another only in the summary line above; Boomtown carries the same numbers as
 * Classic, so without this the two cards would read as identical and the
 * default would look arbitrary.
 */
export function editionExtra(id: RulesetId): string | null {
  const ruleset = PRESETS[id];
  const extras = [
    ...(ruleset.forcedVisibility === 'hidden' ? ['closed books'] : []),
    ...(ruleset.endVote ? ['a vote can end it early'] : []),
  ];
  return extras.length > 0 ? extras.join(' · ') : null;
}

export function EditionChoice({
  value,
  onChange,
}: {
  value: RulesetId;
  onChange: (id: RulesetId) => void;
}) {
  return (
    <div className={styles.field}>
      <span id="edition-label">Edition</span>
      {/* A radiogroup of buttons rather than <input type="radio">: the whole
          card is the target, and the description belongs inside it. */}
      <div className={styles.editions} role="radiogroup" aria-labelledby="edition-label">
        {ORDER.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={value === id}
            className={styles.edition}
            onClick={() => onChange(id)}
          >
            <span className={styles.editionName}>{editionLabel(id)}</span>
            <span className={styles.editionNote}>{editionSummary(id)}</span>
            {editionExtra(id) && <span className={styles.editionExtra}>{editionExtra(id)}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
