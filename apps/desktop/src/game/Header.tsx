import { useEffect, useState } from 'react';
import {
  BackwardIcon,
  ForwardIcon,
  MusicalNoteIcon,
  NoSymbolIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  SwatchIcon,
} from '@heroicons/react/24/solid';
import type { TurnStep } from '@boomtown/engine';
import { useAnyView, useGameState, useLocalActiveView } from '../client/GameClientProvider.js';
import { useReference } from '../reference/ReferenceContext.js';
import { editionLabel } from '../setup/editionLabel.js';
import { soundManager } from '../audio/soundManager.js';
import { musicManager } from '../audio/musicManager.js';
import { loadSettings, saveSettings } from '../settings/settings.js';
import { useIndustryPatterns } from '../settings/useSetting.js';
import { copy, fill } from '../copy/copy.js';
import { Button } from '../ui/Button.js';
import { ExitGame } from './ExitGame.js';
import logoUrl from '../assets/boomtown-logo.png';
import styles from './game.module.css';

const PHASE: Record<TurnStep, string> = {
  place: copy.header.phase.place,
  found: copy.header.phase.found,
  merge: copy.header.phase.merge,
  buy: copy.header.phase.buy,
  'end-check': copy.header.phase.endCheck,
  vote: copy.header.phase.vote,
};

export function Header({ onExit, online = false }: { onExit?: (() => void) | undefined; online?: boolean }) {
  // Two views, deliberately. Everything in the status block except the phase
  // readout is public and belongs to the table, not the turn, so it reads
  // `useAnyView()` and stays on screen throughout — waiting is exactly when a
  // player reaches for the reference. (It used to hang off `activeView`, which
  // online is null on every remote player's turn, taking the whole block with
  // it.) The phase is the exception, and it wants `useLocalActiveView` rather
  // than `activeView`: hot-seat holds a view for every seat, bots included, so
  // `activeView` would keep an accent-coloured "Place a tile" on screen while
  // a bot plays — reading as an instruction to a player who has no move.
  const view = useAnyView();
  const active = useLocalActiveView();
  const turn = useGameState((state) => state.log.filter((event) => event.type === 'turn-advanced').length + 1);
  const { openChart, openRules } = useReference();
  // Lives in the always-rendered brand region rather than the status block
  // below (KTD5): the status block used to vanish on a bot's or a remote
  // player's turn, exactly when a spectator most wants the volume control. It
  // no longer does, but the volume still belongs with the brand — it is a
  // property of the app, not of the table.
  //
  // The speaker opens a pair of sliders rather than toggling silence — effects
  // and music set separately, each labelled by its own icon, and zero on either
  // is the mute that button used to be. Kept behind a click because the chrome
  // is a strip, not a mixing desk: the sliders are for setting a level, not for
  // reading one.
  const [effectsVolume, setEffectsVolume] = useState(() => soundManager.volume());
  const [musicVolume, setMusicVolume] = useState(() => musicManager.volume());
  const [volumeOpen, setVolumeOpen] = useState(false);
  const changeEffects = (next: number) => {
    // Effects take the new level the next time one fires — they are half a
    // second long, so there is nothing playing to correct.
    soundManager.setVolume(next);
    setEffectsVolume(next);
  };
  const changeMusic = (next: number) => {
    // A track is minutes long, so `setVolume` pushes the change onto it now.
    musicManager.setVolume(next);
    setMusicVolume(next);
  };

  // Music plays while a game is on screen and stops when the table is left —
  // which keeps it true that whenever music is audible, both controls for it
  // are on screen. (The menu has neither.)
  const [track, setTrack] = useState(() => musicManager.current());
  const [musicMuted, setMusicMuted] = useState(() => musicManager.isMuted());
  useEffect(() => {
    musicManager.begin();
    return () => musicManager.release();
  }, []);
  // Naming the track for a moment after a skip is the only feedback the arrows
  // can give: nothing about a back/forward icon says which of four you landed
  // on, and a permanent title would be one more thing to read in the chrome.
  const [announcing, setAnnouncing] = useState(false);
  useEffect(() => {
    if (!announcing) return;
    const timer = window.setTimeout(() => setAnnouncing(false), 2600);
    return () => window.clearTimeout(timer);
  }, [announcing, track]);
  const skip = (to: 'previous' | 'next') => () => {
    setTrack(to === 'next' ? musicManager.next() : musicManager.previous());
    setAnnouncing(true);
  };
  const toggleMusic = () => {
    const next = !musicMuted;
    musicManager.setMuted(next);
    setMusicMuted(next);
  };

  // Industry patterns (#19) switch here as well as in Settings, because
  // Settings is only reachable from the menu: a player who finds mid-game that
  // they cannot separate two chains should not have to leave the table to fix
  // it. It is the same stored setting, so the dialog shows what was set here.
  const patterns = useIndustryPatterns();
  const togglePatterns = () => saveSettings({ ...loadSettings(), industryPatterns: !patterns });

  // "?" opens the stock reference and F1 the rules, unless a text field has
  // focus. F1 rather than a letter: the play surface has no text input to
  // shadow, but a bare letter would still collide with any shortcut added
  // later, and F1 is unambiguous.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '?' && e.key !== 'F1') return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      if (e.key === '?') openChart();
      else openRules();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openChart, openRules]);

  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <img src={logoUrl} alt={copy.app.name} className={styles.brandLogo} />
        <span className={styles.brandDivider} aria-hidden />
        <span className={styles.tagline}>{copy.app.tagline}</span>
        <button
          type="button"
          className={styles.muteButton}
          onClick={() => setVolumeOpen((open) => !open)}
          aria-label={copy.header.volume}
          aria-expanded={volumeOpen}
        >
          {effectsVolume === 0 ? (
            <SpeakerXMarkIcon width={16} height={16} />
          ) : (
            <SpeakerWaveIcon width={16} height={16} />
          )}
        </button>
        {volumeOpen && (
          <span className={styles.volumeGroup}>
            <span className={styles.volumeRow}>
              {/* The icons are the labels: two bare sliders side by side would
                  say nothing about which is which. */}
              <SpeakerWaveIcon width={13} height={13} aria-hidden />
              <input
                type="range"
                className={styles.volumeSlider}
                min={0}
                max={100}
                step={5}
                value={Math.round(effectsVolume * 100)}
                aria-label={copy.header.effectsVolume}
                onChange={(e) => changeEffects(Number(e.target.value) / 100)}
              />
            </span>
            <span className={styles.volumeRow}>
              <MusicalNoteIcon width={13} height={13} aria-hidden />
              <input
                type="range"
                className={styles.volumeSlider}
                min={0}
                max={100}
                step={5}
                value={Math.round(musicVolume * 100)}
                aria-label={copy.header.musicVolume}
                onChange={(e) => changeMusic(Number(e.target.value) / 100)}
              />
            </span>
          </span>
        )}
        <span className={styles.musicGroup}>
          <button
            type="button"
            className={`${styles.muteButton} ${styles.skipButton}`}
            onClick={skip('previous')}
            aria-label={copy.header.previousTrack}
          >
            <BackwardIcon width={14} height={14} />
          </button>
          <button
            type="button"
            className={styles.muteButton}
            onClick={toggleMusic}
            aria-label={fill(musicMuted ? copy.header.unmuteMusic : copy.header.muteMusic, {
              track: track.title,
            })}
            aria-pressed={musicMuted}
            title={track.title}
          >
            {musicMuted ? <NoSymbolIcon width={16} height={16} /> : <MusicalNoteIcon width={16} height={16} />}
          </button>
          <button
            type="button"
            className={`${styles.muteButton} ${styles.skipButton}`}
            onClick={skip('next')}
            aria-label={copy.header.nextTrack}
          >
            <ForwardIcon width={14} height={14} />
          </button>
        </span>
        <button
          type="button"
          className={styles.muteButton}
          onClick={togglePatterns}
          aria-label={copy.header.patterns}
          aria-pressed={patterns}
          title={copy.header.patterns}
        >
          <SwatchIcon width={16} height={16} />
        </button>
        {announcing && (
          <span className={styles.trackName} aria-hidden>
            {track.title}
          </span>
        )}
        {/* In the brand region, which is always rendered — the status block
            below needs a view, and a broken table is exactly when there may
            not be one and exactly when you want out (#73). */}
        {onExit && <ExitGame onExit={onExit} online={online} />}
      </div>
      {view && (
        <div className={styles.status}>
          {/* The edition and the turn count are one line of type read across,
              so they share a baseline. Grouping them is what makes that
              possible: the row itself has to centre, because the reference
              buttons beside them are twice the height of any text in it. */}
          <span className={styles.statusText}>
            <span className={styles.statusLabel}>{editionLabel(view.ruleset.id)}</span>
            <span className={styles.turnReadout}>
              <span className={styles.statusLabel}>{copy.header.turn}</span>{' '}
              <span className={`serif tabnum ${styles.turnNumber}`}>{turn}</span>
            </span>
          </span>
          <div className={styles.referenceGroup}>
            <Button variant="onChrome" className={styles.reference} onClick={openChart}>
              {copy.header.reference}
            </Button>
            <Button variant="onChrome" className={styles.reference} onClick={openRules}>
              {copy.header.rules}
            </Button>
          </div>
          {/* The one genuinely turn-bound readout: it describes what the seat
              on the clock must do, so it stands down when that isn't you. */}
          {active && <span className={styles.phase}>{PHASE[active.step]}</span>}
        </div>
      )}
    </header>
  );
}
