import { useEffect, useState } from 'react';
import { formatEntry, netlog, type NetLogEntry } from '@boomtown/client-core';
import styles from './netlog.module.css';
// `copy` is taken here by the copy-to-clipboard handler below.
import { copy as strings } from '../copy/copy.js';

/**
 * The online-play timeline, on screen. Ctrl/Cmd+Shift+L toggles it from
 * anywhere in the app — including from the lobby that is refusing to fill,
 * which is the whole point: the answer to "it just says waiting for the room"
 * is the frame list, and asking a player to open devtools is not a plan.
 *
 * Mounted in every build. In a packaged build the log captures nothing until
 * it is switched on (the toggle here, persisted), so this costs a release
 * nothing but a key handler.
 */
export function NetLogOverlay() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<readonly NetLogEntry[]>([]);
  const [enabled, setEnabled] = useState(() => netlog.isEnabled());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        setOpen((was) => !was);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Only follow the log while the panel is open — a closed panel should not
  // re-render the app on every frame.
  useEffect(() => {
    if (!open) return;
    setEntries(netlog.entries());
    return netlog.subscribe(() => setEntries(netlog.entries()));
  }, [open]);

  if (!open) return null;

  const copy = () => {
    void navigator.clipboard?.writeText(netlog.asText()).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  return (
    <aside className={styles.panel} aria-label={strings.netlog.label}>
      <header className={styles.head}>
        <strong>{strings.netlog.title}</strong>
        <span className={styles.count}>{entries.length} entries</span>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              netlog.setEnabled(e.target.checked, true);
              setEnabled(e.target.checked);
            }}
          />
          capture
        </label>
        <button type="button" onClick={copy}>
          {copied ? strings.netlog.copied : strings.netlog.copy}
        </button>
        <button
          type="button"
          onClick={() => {
            netlog.clear();
            setEntries([]);
          }}
        >
          Clear
        </button>
        <button type="button" onClick={() => setOpen(false)} aria-label={strings.netlog.close}>
          ✕
        </button>
      </header>
      <ol className={styles.list}>
        {entries.length === 0 && (
          <li className={styles.empty}>
            {enabled
              ? strings.netlog.emptyOn
              : strings.netlog.emptyOff}
          </li>
        )}
        {entries.map((entry) => (
          <li key={entry.seq} className={styles.row} data-direction={entry.direction}>
            {formatEntry(entry)}
          </li>
        ))}
      </ol>
    </aside>
  );
}
