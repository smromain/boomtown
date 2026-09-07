import type { SeatConfig as Seat } from './gameConfig.js';
import styles from './setup.module.css';

interface SeatRowProps {
  readonly index: number;
  readonly seat: Seat;
  readonly onChange: (seat: Seat) => void;
}

/** One seat: name, human/bot, and — for a bot — a 1–10 difficulty dial (KTD7). */
export function SeatRow({ index, seat, onChange }: SeatRowProps) {
  return (
    <div className={styles.seat}>
      <input
        type="text"
        aria-label={`Seat ${index + 1} name`}
        value={seat.name}
        onChange={(event) => onChange({ ...seat, name: event.target.value })}
      />

      <select
        aria-label={`Seat ${index + 1} type`}
        value={seat.kind}
        onChange={(event) => onChange({ ...seat, kind: event.target.value as Seat['kind'] })}
      >
        <option value="human">Human</option>
        <option value="bot">Bot</option>
      </select>

      {seat.kind === 'bot' ? (
        <label className={styles.difficulty}>
          Lvl
          <input
            type="range"
            min={1}
            max={10}
            aria-label={`Seat ${index + 1} difficulty`}
            value={seat.difficulty}
            onChange={(event) => onChange({ ...seat, difficulty: Number(event.target.value) })}
          />
          {seat.difficulty}
        </label>
      ) : (
        <span />
      )}
    </div>
  );
}
