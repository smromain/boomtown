import { LockClosedIcon } from '@heroicons/react/24/solid';
import styles from './form.module.css';

export interface ChoiceOption<T extends string | number> {
  readonly value: T;
  readonly label: string;
  /** Long-form wording for the accessible name where the tile is terse. */
  readonly description?: string;
}

/**
 * The tile picker: every option on screen at once, one click to choose.
 *
 * This replaces every `<select>` the app had. None of them held more than five
 * options — seat count is 2–6, seat type is human or bot, visibility is open or
 * closed — and a dropdown is a device for hiding a list too long to show. The
 * tiles borrow the board's own vocabulary (a cell, a ring, an ink fill) so the
 * setup screen is made of the same material as the game behind it, rather than
 * of operating-system form controls.
 *
 * Selection matches the edition cards — accent border on a raised surface —
 * because two selection idioms on one screen is one too many.
 *
 * `numeric` squares the tiles for a single digit; otherwise they size to their
 * label. `quiet` marks the chosen tile in ink rather than accent, for a picker
 * that repeats down a list.
 */
export function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
  numeric = false,
  quiet = false,
  id,
}: {
  label: string;
  value: T;
  options: readonly ChoiceOption<T>[];
  onChange: (value: T) => void;
  numeric?: boolean;
  /** Ink rather than accent for the chosen tile — for a picker that repeats
   *  down a list, where six accent outlines would drown the screen-level
   *  choices. */
  quiet?: boolean;
  /** Ties the group to a note elsewhere in the field, as `aria-describedby`. */
  id?: string;
}) {
  return (
    <div className={styles.tiles} role="radiogroup" aria-label={label} {...(id ? { id } : {})}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          aria-label={option.description ?? option.label}
          className={[styles.tile, numeric && styles.tileNumeric, quiet && styles.tileQuiet]
            .filter(Boolean)
            .join(' ')}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A setting the ruleset has taken out of the table's hands. A disabled control
 * reads as something broken; this reads as something sealed, which is what it
 * is — the Boomtown set fixes the books closed, and says so here rather than
 * greying out a picker and hoping the note below explains it.
 */
export function Sealed({ children }: { children: React.ReactNode }) {
  return (
    <span className={styles.sealed}>
      <LockClosedIcon width={13} height={13} aria-hidden="true" />
      {children}
    </span>
  );
}
