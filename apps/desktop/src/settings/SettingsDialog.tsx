import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { netlog } from '@boomtown/client-core';
import { RULES, type RulesetId, type Visibility } from '@boomtown/engine';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from './settings.js';
import { buildInfo } from './buildInfo.js';
import type { PreviewKind } from '../beats/debug/fixtures.js';
import { Choice } from '../setup/Choice.js';
import { Button } from '../ui/Button.js';
import { MUSIC_SOURCE, TRACKS, musicManager } from '../audio/musicManager.js';
import { copy, fill } from '../copy/copy.js';
import form from '../setup/form.module.css';
import decisionStyles from '../decisions/decisions.module.css';
import styles from './settings.module.css';

const c = copy.settings;

/** Fixed for the life of the process — the constants are stamped at build time. */
const build = buildInfo();

/** "Music: 40%", or "Music: off" at the bottom of the range — a slider sitting
 *  at zero should say what that means rather than leave it to be inferred. */
const level = (label: string, volume: number): string =>
  volume === 0
    ? fill(c.levelOff, { label })
    : fill(c.levelValue, { label, value: Math.round(volume * 100) });

const DEBUG_BEATS: readonly { readonly kind: PreviewKind; readonly label: string }[] = [
  { kind: 'founding', label: c.debug.founding },
  { kind: 'buy-stock', label: c.debug.buyStock },
  { kind: 'merger', label: c.debug.mergerTwo },
  { kind: 'merger-three-way', label: c.debug.mergerThree },
  { kind: 'motion', label: c.debug.motion },
  { kind: 'endgame', label: c.debug.endgame },
  { kind: 'victory', label: c.debug.victory },
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
              <span className={`kicker ${form.eyebrow}`}>{c.eyebrow}</span>
              <Dialog.Title className={form.title}>{c.title}</Dialog.Title>
              {/* Empty is a fair thing for the copy to say: no lede rather
                  than an empty paragraph holding its own margins open. */}
              {c.lede && <p className={form.lede}>{c.lede}</p>}
            </div>
            <Dialog.Close className={styles.close} aria-label={c.close}>
              ✕
            </Dialog.Close>
          </header>

          <div className={styles.body}>
            <div className={styles.columns}>
              <section className={styles.column} aria-label={c.newTable}>
                <span className={styles.columnLabel}>{c.newTable}</span>

                <div className={form.field}>
                  <span>{c.defaultEdition}</span>
                  <Choice
                    label={c.defaultEdition}
                    value={draft.edition}
                    options={[
                      { value: 'boomtown' as RulesetId, label: copy.editions.boomtown },
                      { value: 'classic' as RulesetId, label: copy.editions.classic },
                      { value: 'edition-2015' as RulesetId, label: copy.editions.modern },
                    ]}
                    onChange={(edition) => patch({ edition })}
                  />
                </div>

                <div className={form.field}>
                  <span>{c.defaultSeats}</span>
                  <Choice
                    label={c.defaultSeats}
                    numeric
                    value={draft.seatCount}
                    options={Array.from(
                      { length: RULES.maxPlayers - RULES.minPlayers + 1 },
                      (_, i) => RULES.minPlayers + i,
                    ).map((n) => ({
                      value: n,
                      label: String(n),
                      description: fill(c.seatsDescription, { n }),
                    }))}
                    onChange={(seatCount) => patch({ seatCount })}
                  />
                </div>

                <div className={form.field}>
                  <span>{c.defaultVisibility}</span>
                  <Choice
                    label={c.defaultVisibility}
                    value={draft.visibility}
                    options={[
                      { value: 'open' as Visibility, label: c.openBooks },
                      { value: 'hidden' as Visibility, label: c.closedBooks },
                    ]}
                    onChange={(visibility) => patch({ visibility })}
                  />
                </div>

                <label className={form.field}>
                  <span>{fill(c.botDifficultyValue, { n: draft.botDifficulty })}</span>
                  <input
                    type="range"
                    className={styles.slider}
                    min={1}
                    max={10}
                    value={draft.botDifficulty}
                    aria-label={c.botDifficulty}
                    onChange={(e) => patch({ botDifficulty: Number(e.target.value) })}
                  />
                </label>
              </section>

              <section className={styles.column} aria-label={c.thisMachine}>
                <span className={styles.columnLabel}>{c.thisMachine}</span>

                <label className={form.field}>
                  <span>{level(c.effectsLabel, draft.effectsVolume)}</span>
                  <input
                    type="range"
                    className={styles.slider}
                    min={0}
                    max={100}
                    step={5}
                    value={Math.round(draft.effectsVolume * 100)}
                    aria-label={c.effectsVolume}
                    onChange={(e) => patch({ effectsVolume: Number(e.target.value) / 100 })}
                  />
                </label>

                <label className={form.field}>
                  <span>{level(c.musicLabel, draft.musicVolume)}</span>
                  <input
                    type="range"
                    className={styles.slider}
                    min={0}
                    max={100}
                    step={5}
                    value={Math.round(draft.musicVolume * 100)}
                    aria-label={c.musicVolume}
                    onChange={(e) => patch({ musicVolume: Number(e.target.value) / 100 })}
                  />
                </label>

                <label className={form.field}>
                  <span>{c.onlineHost}</span>
                  <input
                    type="text"
                    className={form.input}
                    value={draft.partykitHost}
                    aria-label={c.onlineHost}
                    placeholder={c.onlineHostPlaceholder}
                    onChange={(e) => patch({ partykitHost: e.target.value })}
                  />
                  <span className={form.note}>{c.onlineHostNote}</span>
                </label>

                {/* Dev builds only. In a packaged build the log is off and
                    there is no way to switch it on: a control whose whole
                    purpose is diagnosing a stuck room is noise on a settings
                    page a player reads once. The capture code still ships —
                    it costs a release nothing — but nothing reaches it. */}
                {import.meta.env.DEV && (
                  <div className={form.field}>
                    <span>{c.logging}</span>
                    <Choice
                      quiet
                      label={c.logging}
                      value={logging ? 'on' : 'off'}
                      options={[
                        { value: 'on', label: c.on },
                        { value: 'off', label: c.off },
                      ]}
                      onChange={(value) => {
                        // Persisted immediately, not on Save: a player being
                        // talked through a stuck room should not have to find
                        // Save first.
                        netlog.setEnabled(value === 'on', true);
                        setLogging(value === 'on');
                      }}
                    />
                    <span className={form.note}>{c.loggingNote}</span>
                  </div>
                )}
              </section>
            </div>

            <section className={styles.credits} aria-label={c.musicCredits}>
              <span className={styles.columnLabel}>{c.musicLabel}</span>
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
                <span className={styles.columnLabel}>{c.debug.heading}</span>
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
            {/* Which build this is, in the footer rather than the body: the
                body scrolls and this is the one thing a player is asked to read
                back when reporting a bug, so it should never be below the
                fold. */}
            <span className={styles.build} aria-label={c.buildLabel}>
              {build.released
                ? fill(c.buildVersion, { version: build.version, date: build.date })
                : fill(c.buildUnreleased, { date: build.date })}
            </span>
            <Button variant="ghost" onClick={() => setDraft(DEFAULT_SETTINGS)}>
              {c.reset}
            </Button>
            <Button variant="primary" onClick={save}>
              {c.save}
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
