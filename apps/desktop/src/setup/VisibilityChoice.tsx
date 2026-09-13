import type { Visibility } from '@boomtown/engine';
import { Choice, Sealed } from './Choice.js';
import { editionLabel } from './editionLabel.js';
import { effectiveVisibility, visibilityIsFixed, type GameConfig } from './gameConfig.js';
import styles from './form.module.css';

/**
 * Who can see cash and holdings — a table setting under the two published
 * editions, and not a setting at all under Boomtown, which fixes the books
 * closed.
 *
 * The fixed case is a sealed chip rather than a disabled picker. A greyed-out
 * control reads as something broken and invites a click that does nothing; the
 * chip says the ruleset already decided, which is the truth.
 */
export function VisibilityChoice({
  config,
  onChange,
}: {
  config: GameConfig;
  onChange: (visibility: Visibility) => void;
}) {
  const fixed = visibilityIsFixed(config);
  return (
    <div className={styles.field}>
      <span>Cash and holdings</span>
      {fixed ? (
        <>
          <Sealed>Closed books</Sealed>
          <span className={styles.note}>
            {editionLabel(config.edition)} is played with the books closed — the ruleset fixes this.
          </span>
        </>
      ) : (
        <>
          <Choice
            label="Cash and holdings"
            value={effectiveVisibility(config)}
            options={[
              { value: 'open', label: 'Open books', description: 'Open — everyone sees everything' },
              { value: 'hidden', label: 'Closed books', description: 'Closed — only your own' },
            ]}
            onChange={onChange}
          />
          <span className={styles.note}>
            {effectiveVisibility(config) === 'open'
              ? 'Every player’s cash and holdings are on show.'
              : 'Only your own cash and holdings are yours to see.'}
          </span>
        </>
      )}
    </div>
  );
}
