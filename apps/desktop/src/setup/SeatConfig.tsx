import { Choice } from './Choice.js';
import type { SeatConfig as Seat } from './gameConfig.js';
import { copy, fill } from '../copy/copy.js';
import styles from './form.module.css';

interface SeatRowProps {
  readonly index: number;
  readonly seat: Seat;
  readonly onChange: (seat: Seat) => void;
  /**
   * Hide the name field (#20). Online, a seat's name is never the host's to
   * set: `toRoomConfig` doesn't send it, and the server names a human seat from
   * whoever joins it and a bot seat `Bot N`. Only the human/bot choice survives
   * the trip, so offering a name box there invites the host to fill in three
   * names that are silently discarded.
   */
  readonly nameless?: boolean;
}

/**
 * One seat: a numeral, who holds it, human/bot, and — for a bot — a 1–10
 * difficulty dial (KTD7).
 *
 * The difficulty column is always in the grid, empty for a human seat. It used
 * to appear out of nothing when a seat became a bot, which shoved the row's
 * other controls sideways on every switch: the layout jumped at the exact
 * moment someone was reading it.
 */
export function SeatRow({ index, seat, onChange, nameless = false }: SeatRowProps) {
  return (
    <div className={styles.seat} data-nameless={nameless || undefined}>
      <span className={styles.seatNo} aria-hidden="true">
        {index + 1}
      </span>

      {nameless ? (
        <span className={styles.seatLabel}>
          {seat.kind === 'bot' ? copy.setup.seat.botSeat : copy.setup.seat.openSeat}
        </span>
      ) : (
        <input
          type="text"
          className={styles.input}
          aria-label={fill(copy.setup.seat.name, { n: index + 1 })}
          value={seat.name}
          onChange={(event) => onChange({ ...seat, name: event.target.value })}
        />
      )}

      <Choice
        quiet
        label={fill(copy.setup.seat.type, { n: index + 1 })}
        value={seat.kind}
        options={[
          { value: 'human', label: copy.setup.seat.human },
          { value: 'bot', label: copy.setup.seat.bot },
        ]}
        onChange={(kind) => onChange({ ...seat, kind })}
      />

      {seat.kind === 'bot' ? (
        <label className={styles.difficulty}>
          {copy.setup.seat.skill}
          <input
            type="range"
            min={1}
            max={10}
            aria-label={fill(copy.setup.seat.difficulty, { n: index + 1 })}
            value={seat.difficulty}
            onChange={(event) => onChange({ ...seat, difficulty: Number(event.target.value) })}
          />
          <span className={styles.difficultyValue}>{seat.difficulty}</span>
        </label>
      ) : (
        <span />
      )}
    </div>
  );
}
