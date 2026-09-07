import { useEffect, useState } from 'react';
import { useGameClient, useGameState } from '../client/GameClientProvider.js';
import { debugDump } from '../debug/dump.js';
import styles from './game.module.css';

/**
 * Surfaces a rejected command. Before this, `state.lastError` was recorded but
 * never rendered, so a command the engine refused (a stale button, a wrong-seat
 * click) looked like a dead click. Auto-dismisses; the next accepted command
 * clears `lastError` anyway. In dev it also writes a state snapshot to disk.
 */
export function ErrorToast() {
  const client = useGameClient();
  const error = useGameState((state) => state.lastError);
  const [shown, setShown] = useState<string | null>(null);

  useEffect(() => {
    if (!error) {
      setShown(null);
      return;
    }
    setShown(error.message);
    const s = client.store.getState();
    const view = s.activeSeat != null ? s.views[s.activeSeat] : undefined;
    if (view) {
      debugDump('command-rejected', {
        note: `${'code' in error ? error.code : 'error'}: ${error.message}`,
        // the client store has no full GameState; the active seat's view + log
        // is enough to see what was rejected and against what.
        state: view as unknown as Parameters<typeof debugDump>[1]['state'],
        log: s.log,
        extra: { lastError: error },
      });
    }
    const timer = setTimeout(() => {
      client.store.setState((current) => ({ ...current, lastError: null }));
    }, 4000);
    return () => clearTimeout(timer);
  }, [error, client]);

  if (!shown) return null;
  return (
    <div className={styles.toast} role="alert">
      {shown}
    </div>
  );
}
