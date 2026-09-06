import { useGameState } from '../client/GameClientProvider.js';
import { describeEvent } from './eventText.js';
import styles from './panels.module.css';

/** A running list of engine events, newest first; every merger step is its own line. */
export function EventLog() {
  const log = useGameState((state) => state.log);

  return (
    <section className={styles.panel} aria-label="Event log">
      <h2>Log</h2>
      <ol className={styles.log}>
        {log.map((event, index) => (
          <li key={index}>{describeEvent(event)}</li>
        ))}
      </ol>
    </section>
  );
}
