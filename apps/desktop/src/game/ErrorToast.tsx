import { useEffect, useState } from 'react';
import { useGameClient, useGameState } from '../client/GameClientProvider.js';
import styles from './game.module.css';

/**
 * Surfaces a rejected command. Before this, `state.lastError` was recorded but
 * never rendered, so a command the engine refused (a stale button, a wrong-seat
 * click) looked like a dead click. Auto-dismisses; the next accepted command
 * clears `lastError` anyway.
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
    const timer = setTimeout(() => {
      // clear the store error so an identical next rejection re-triggers
      client.store.setState((s) => ({ ...s, lastError: null }));
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
