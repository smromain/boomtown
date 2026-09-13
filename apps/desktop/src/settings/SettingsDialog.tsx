import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { netlog } from '@boomtown/client-core';
import { RULES, type RulesetId, type Visibility } from '@boomtown/engine';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from './settings.js';
import type { PreviewKind } from '../beats/debug/fixtures.js';
import { Choice } from '../setup/Choice.js';
import { Button } from '../ui/Button.js';
import { MUSIC_SOURCE, TRACKS, musicManager } from '../audio/musicManager.js';
import form from '../setup/form.module.css';
import decisionStyles from '../decisions/decisions.module.css';
import styles from './settings.module.css';

/** "Music: 40%", or "Music: off" at the bottom of the range — a slider sitting
 *  at zero should say what that means rather than leave it to be inferred. */
const level = (label: string, volume: number): string =>
  `${label}: ${volume === 0 ? 'off' : `${Math.round(volume * 100)}%`}`;

const DEBUG_BEATS: readonly { readonly kind: PreviewKind; readonly label: string }[] = [
  { kind: 'founding', label: 'Founding' },
  { kind: 'buy-stock', label: 'Buy stock' },
  { kind: 'merger', label: 'Merger (2-way)' },
  { kind: 'merger-three-way', label: 'Merger (3-way)' },
  { kind: 'motion', label: 'Motion' },
  { kind: 'endgame', label: 'Endgame' },
  { kind: 'victory', label: 'Victory' },
];

/**
 * The settings dialog: default table visibility, bot difficulty, edition, seat
 * count, sound level, and the PartyKit host override (blank = the build-time
 * default). All renderer preferences, persisted to `localStorage`.
 *
 * The two sound levels are the same numbers the header's sliders write, not a
 * second pair: a table that turns the volume down mid-game has set their level,
 * and being handed it back at full the next time they load would make the
 * in-game control feel like it didn't take. Setting them here is for doing it
 * before a game rather than during one — a game the app opens quietly, or with
 * the music off and the effects up.
 *
 * It also carries the music credits. They belong here rather than in the game
 * chrome — the header has room to name the track playing, not to name everyone
 * who wrote one — and here they are one scroll from the settings that govern
 * the music itself. The list is built from `TRACKS`, so adding a track without
 * crediting its composer is not something this dialog can be left behind by.
 *
 * It speaks the setup screens' language rather than a dialog dialect of its
 * own — the same kicker/serif/lede head, the same field labels, the same tile
 * pickers, the same button primitive. It is the third screen that asks a player
 * to choose how a table is set up, and it used to be the only one that looked
 * like a settings page from a different application.
 *
 * Two columns for the same reason those screens have them: the choices split
 * cleanly into what a game is dealt with and what this machine does, and a
 * single stack of ten fields is a scroll where a glance would do.
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

  // This dialog stays mounted whether or not it is open, so its draft would
  // otherwise be a snapshot of whatever the settings were when the app started
  // — and Save would put that back, quietly undoing anything changed elsewhere
  // since. Re-reading on open is what makes the header's volume slider and this
  // field the same setting rather than two that fight.
  useEffect(() => {
    if (open) setDraft(loadSettings());
  }, [open]);

  const patch = (over: Partial<Settings>) => setDraft((d) => ({ ...d, ...over }));

  const save = () => {
    saveSettings(draft);
    // A track playing behind this dialog has to hear the new level now; effects
    // pick it up as they next fire.
    musicManager.applyVolume();
    onClose();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={decisionStyles.overlay} />
        <Dialog.Content className={styles.settings} aria-describedby={undefined}>
          <header className={styles.head}>
            <div>
              <span className={`kicker ${form.eyebrow}`}>preferences · this machine</span>
              <Dialog.Title className={form.title}>Settings</Dialog.Title>
              <p className={form.lede}>
                What a new table starts with, and how loud it is. A game already dealt keeps the
                rules it was dealt under.
              </p>
            </div>
            <Dialog.Close className={styles.close} aria-label="Close">
              ✕
            </Dialog.Close>
          </header>

          <div className={styles.body}>
            <div className={styles.columns}>
              <section className={styles.column} aria-label="New table defaults">
                <span className={styles.columnLabel}>A new table</span>

                <div className={form.field}>
                  <span>Default edition</span>
                  <Choice
                    label="Default edition"
                    value={draft.edition}
                    options={[
                      { value: 'boomtown' as RulesetId, label: 'Boomtown' },
                      { value: 'classic' as RulesetId, label: 'Classic' },
                      { value: 'edition-2015' as RulesetId, label: 'Modern' },
                    ]}
                    onChange={(edition) => patch({ edition })}
                  />
                </div>

                <div className={form.field}>
                  <span>Default seats</span>
                  <Choice
                    label="Default seats"
                    numeric
                    value={draft.seatCount}
                    options={Array.from(
                      { length: RULES.maxPlayers - RULES.minPlayers + 1 },
                      (_, i) => RULES.minPlayers + i,
                    ).map((n) => ({ value: n, label: String(n), description: `${n} seats` }))}
                    onChange={(seatCount) => patch({ seatCount })}
                  />
                </div>

                <div className={form.field}>
                  <span>Default cash and holdings</span>
                  <Choice
                    label="Default cash and holdings"
                    value={draft.visibility}
                    options={[
                      { value: 'open' as Visibility, label: 'Open books' },
                      { value: 'hidden' as Visibility, label: 'Closed books' },
                    ]}
                    onChange={(visibility) => patch({ visibility })}
                  />
                </div>

                <label className={form.field}>
                  <span>Default bot difficulty · {draft.botDifficulty}</span>
                  <input
                    type="range"
                    className={styles.slider}
                    min={1}
                    max={10}
                    value={draft.botDifficulty}
                    aria-label="Default bot difficulty"
                    onChange={(e) => patch({ botDifficulty: Number(e.target.value) })}
                  />
                </label>
              </section>

              <section className={styles.column} aria-label="This machine">
                <span className={styles.columnLabel}>This machine</span>

                <label className={form.field}>
                  <span>{level('Sound effects', draft.effectsVolume)}</span>
                  <input
                    type="range"
                    className={styles.slider}
                    min={0}
                    max={100}
                    step={5}
                    value={Math.round(draft.effectsVolume * 100)}
                    aria-label="Sound effect volume"
                    onChange={(e) => patch({ effectsVolume: Number(e.target.value) / 100 })}
                  />
                </label>

                <label className={form.field}>
                  <span>{level('Music', draft.musicVolume)}</span>
                  <input
                    type="range"
                    className={styles.slider}
                    min={0}
                    max={100}
                    step={5}
                    value={Math.round(draft.musicVolume * 100)}
                    aria-label="Music volume"
                    onChange={(e) => patch({ musicVolume: Number(e.target.value) / 100 })}
                  />
                </label>

                <label className={form.field}>
                  <span>Online host</span>
                  <input
                    type="text"
                    className={form.input}
                    value={draft.partykitHost}
                    aria-label="Online host"
                    placeholder="host.partykit.dev"
                    onChange={(e) => patch({ partykitHost: e.target.value })}
                  />
                  <span className={form.note}>Blank uses the server the app ships with.</span>
                </label>

                <div className={form.field}>
                  <span>Log online play</span>
                  <Choice
                    quiet
                    label="Log online play"
                    value={logging ? 'on' : 'off'}
                    options={[
                      { value: 'on', label: 'On' },
                      { value: 'off', label: 'Off' },
                    ]}
                    onChange={(value) => {
                      // Persisted immediately, not on Save: a player being
                      // talked through a stuck room should not have to find
                      // Save first.
                      netlog.setEnabled(value === 'on', true);
                      setLogging(value === 'on');
                    }}
                  />
                  <span className={form.note}>Ctrl/Cmd+Shift+L reads the log back.</span>
                </div>
              </section>
            </div>

            <section className={styles.credits} aria-label="Music credits">
              <span className={styles.columnLabel}>Music</span>
              <ul className={styles.creditList}>
                {TRACKS.map((track) => (
                  <li key={track.id}>
                    <span className={styles.creditTitle}>{track.title}</span> — {track.credit}
                  </li>
                ))}
              </ul>
              <span className={styles.creditSource}>{MUSIC_SOURCE}</span>
            </section>

            {import.meta.env.DEV && onDebugTrigger && (
              <section className={styles.debug}>
                <span className={styles.columnLabel}>Debug — preview a beat</span>
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
              </section>
            )}
          </div>

          <footer className={styles.actions}>
            <Button variant="ghost" onClick={() => setDraft(DEFAULT_SETTINGS)}>
              Reset
            </Button>
            <Button variant="primary" onClick={save}>
              Save
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
