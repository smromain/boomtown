import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { useGameState } from '../client/GameClientProvider.js';
import { useActiveBeat } from '../beats/BeatContext.js';
import { coversTheScreen } from '../beats/beatTriggers.js';
import { Portrait, guest, type Guest } from '../art/Portrait.js';
import { Button } from '../ui/Button.js';
import { copy, fill } from '../copy/copy.js';
import { YOU, companiesOf, type Step } from './script.js';
import { useTutorial, useTutorialStep } from './TutorialContext.js';
import styles from './tutorial.module.css';

const t = copy.tutorial;

/** Ripley, a Russian blue drawn for the tutorial alone, on a teal that sets off her pink collar. Her eyes and ears move (`tutorial.module.css`). */
const HOST: Guest = guest(
  [
    ['hosts/ripley-ear-left', 'rp-ear-l'],
    ['hosts/ripley-ear-right', 'rp-ear-r'],
    'hosts/ripley-head',
    ['hosts/ripley-eyes', 'rp-eyes'],
  ],
  '#3E8C8F',
);

/** What the host says on each step, with the companies named. */
function lineFor(step: Step, yours: string, theirs: string): string {
  const say = t.steps;
  switch (step) {
    case 'buy':
      return fill(say.buy, { yours });
    case 'rivalsAgain':
      return fill(say.rivalsAgain, { yours, theirs });
    case 'merge':
      return fill(say.merge, { yours, theirs });
    case 'merger':
      return fill(say.merger, { yours });
    case 'dispose':
      return fill(say.dispose, { yours, theirs });
    case 'safe':
      return fill(say.safe, { theirs });
    default:
      return say[step];
  }
}

/**
 * The tutorial's host: Ripley, at the top of the rail,
 * saying what the step wants. It sits above a decision's overlay, so the line
 * stays readable beside the prompt it is about, and moves to the corner once
 * the end screen has taken the table. It stands aside while a beat has the screen —
 * the beat is the lesson then — and shakes when a move off the script is
 * turned away, rather than adding a second line to read.
 */
export function TutorialHost({ placement }: { placement: 'rail' | 'float' }) {
  const tutorial = useTutorial()!;
  const step = useTutorialStep()!;
  const nudges = useStore(tutorial.store, (s) => s.nudges);
  // Two selectors, each a string: one returning a fresh object would re-render forever.
  const yours = useGameState((state) => {
    const industry = companiesOf(state).yours;
    return industry ? (state.views[YOU]?.corporations[industry].baseName ?? '') : '';
  });
  const theirs = useGameState((state) => state.views[YOU]?.corporations[companiesOf(state).theirs].displayName ?? '');
  const { active } = useActiveBeat();
  const [doneWith, setDoneWith] = useState(false);

  // Replay the shake on every nudge.
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (nudges === 0) return;
    const el = card.current;
    el?.removeAttribute('data-nudge');
    void el?.offsetWidth;
    el?.setAttribute('data-nudge', '');
  }, [nudges]);

  if (active != null && coversTheScreen(active)) return null;
  if (step === 'over' && doneWith) return null;

  return (
    <aside className={styles.host} data-placement={placement} aria-label={t.label} aria-live="polite">
      <Portrait seat={0} name={t.host} size={placement === 'rail' ? 52 : 64} guest={HOST} />
      <div ref={card} className={styles.card}>
        <div className={styles.head}>
          <span className={styles.name}>{t.host}</span>
          <span className={styles.role}>{t.hostRole}</span>
        </div>
        <p className={styles.line}>{lineFor(step, yours, theirs)}</p>
        {step === 'welcome' && (
          <Button variant="primary" onClick={tutorial.welcome}>
            {t.start}
          </Button>
        )}
        {step === 'over' && (
          <Button variant="secondary" onClick={() => setDoneWith(true)}>
            {t.done}
          </Button>
        )}
      </div>
    </aside>
  );
}
