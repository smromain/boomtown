import type { Visibility } from '@boomtown/engine';
import { Choice, Sealed } from './Choice.js';
import { editionLabel } from './editionLabel.js';
import { copy, fill } from '../copy/copy.js';
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
      <span>{copy.setup.visibility.label}</span>
      {fixed ? (
        <>
          <Sealed>{copy.setup.visibility.closed}</Sealed>
          <span className={styles.note}>
            {fill(copy.setup.visibility.sealedNote, { edition: editionLabel(config.edition) })}
          </span>
        </>
      ) : (
        <>
          <Choice
            label={copy.setup.visibility.label}
            value={effectiveVisibility(config)}
            options={[
              {
                value: 'open',
                label: copy.setup.visibility.open,
                description: copy.setup.visibility.openDescription,
              },
              {
                value: 'hidden',
                label: copy.setup.visibility.closed,
                description: copy.setup.visibility.closedDescription,
              },
            ]}
            onChange={onChange}
          />
          <span className={styles.note}>
            {effectiveVisibility(config) === 'open'
              ? copy.setup.visibility.openNote
              : copy.setup.visibility.closedNote}
          </span>
        </>
      )}
    </div>
  );
}
