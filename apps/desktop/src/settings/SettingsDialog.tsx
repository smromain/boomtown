import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { netlog } from '@boomtown/client-core';
import { RULES, type RulesetId, type Visibility } from '@boomtown/engine';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from './settings.js';
import type { PreviewKind } from '../beats/debug/fixtures.js';
import decisionStyles from '../decisions/decisions.module.css';
import styles from './settings.module.css';

const DEBUG_BEATS: readonly { readonly kind: PreviewKind; readonly label: string }[] = [
  { kind: 'founding', label: 'Founding' },
  { kind: 'buy-stock', label: 'Buy stock' },
  { kind: 'merger', label: 'Merger' },
  { kind: 'endgame', label: 'Endgame' },
  { kind: 'victory', label: 'Victory' },
];

/**
 * The settings dialog: default table visibility, bot difficulty, edition, seat
 * count, and the PartyKit host override (blank = the build-time default). All
 * renderer preferences, persisted to `localStorage`.
 *
 * In a dev build only, it also carries a debug section to preview any beat's
 * animation on fixture data — `onDebugTrigger` (when given) fires a beat
 * overlay and closes this dialog, so it isn't fighting the beat's own
 * full-screen curtain for the user's attention.
 */
export function SettingsDialog({
  open,
  onClose,
  onDebugTrigger,
}: {
  open: boolean;
  onClose: () => void;
  onDebugTrigger?: (kind: PreviewKind) => void;
}) {
  const [draft, setDraft] = useState<Settings>(loadSettings);
  const [logging, setLogging] = useState(() => netlog.isEnabled());

  const patch = (over: Partial<Settings>) => setDraft((d) => ({ ...d, ...over }));

  const save = () => {
    saveSettings(draft);
    onClose();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={decisionStyles.overlay} />
        <Dialog.Content className={decisionStyles.content} aria-describedby={undefined}>
          <Dialog.Title>Settings</Dialog.Title>

          <label className={styles.field}>
            <span>Default cash and holdings</span>
            <select
              value={draft.visibility}
              onChange={(e) => patch({ visibility: e.target.value as Visibility })}
            >
              <option value="open">Open</option>
              <option value="hidden">Hidden</option>
            </select>
          </label>

          <label className={styles.field}>
            <span>Default bot difficulty: {draft.botDifficulty}</span>
            <input
              type="range"
              min={1}
              max={10}
              value={draft.botDifficulty}
              aria-label="Default bot difficulty"
              onChange={(e) => patch({ botDifficulty: Number(e.target.value) })}
            />
          </label>

          <label className={styles.field}>
            <span>Default edition</span>
            <select
              value={draft.edition}
              onChange={(e) => patch({ edition: e.target.value as RulesetId })}
            >
              <option value="classic">Classic</option>
              <option value="edition-2015">Modern</option>
            </select>
          </label>

          <label className={styles.field}>
            <span>Default seats</span>
            <select
              value={draft.seatCount}
              onChange={(e) => patch({ seatCount: Number(e.target.value) })}
            >
              {Array.from(
                { length: RULES.maxPlayers - RULES.minPlayers + 1 },
                (_, i) => RULES.minPlayers + i,
              ).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>Online host (blank = default)</span>
            <input
              type="text"
              value={draft.partykitHost}
              aria-label="Online host"
              placeholder="host.partykit.dev — leave blank for the built-in server"
              onChange={(e) => patch({ partykitHost: e.target.value })}
            />
          </label>

          <label className={styles.field}>
            <span>Log online play (Ctrl/Cmd+Shift+L to read it)</span>
            <input
              type="checkbox"
              checked={logging}
              aria-label="Log online play"
              onChange={(e) => {
                // Persisted immediately, not on Save: a player being talked
                // through a stuck room should not have to find Save first.
                netlog.setEnabled(e.target.checked, true);
                setLogging(e.target.checked);
              }}
            />
          </label>

          {import.meta.env.DEV && onDebugTrigger && (
            <div className={styles.debug}>
              <span className={styles.debugLabel}>Debug — preview a beat</span>
              <div className={styles.debugButtons}>
                {DEBUG_BEATS.map(({ kind, label }) => (
                  <button
                    key={kind}
                    type="button"
                    className={styles.debugButton}
                    onClick={() => {
                      onDebugTrigger(kind);
                      onClose();
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setDraft(DEFAULT_SETTINGS)}
            >
              Reset
            </button>
            <button type="button" className={styles.primary} onClick={save}>
              Save
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
