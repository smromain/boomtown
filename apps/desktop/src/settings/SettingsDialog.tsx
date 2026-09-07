import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { RULES, type RulesetId, type Visibility } from '@boomtown/engine';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from './settings.js';
import decisionStyles from '../decisions/decisions.module.css';
import styles from './settings.module.css';

/**
 * The settings dialog: default table visibility, bot difficulty, edition, seat
 * count, and the PartyKit host override (blank = the build-time default). All
 * renderer preferences, persisted to `localStorage`.
 */
export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [draft, setDraft] = useState<Settings>(loadSettings);

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
              <option value="edition-2015">2015 Avalon Hill</option>
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
              placeholder="boomtown.example.partykit.dev"
              onChange={(e) => patch({ partykitHost: e.target.value })}
            />
          </label>

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
