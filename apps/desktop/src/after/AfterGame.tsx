import { useEffect, useMemo } from 'react';
import { PlayIcon, PauseIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import { INDUSTRIES, type CorpView, type Industry, type RankingRow, type Retrospective, type Seat } from '@boomtown/engine';
import { AWARDS_PER_PAGE, AwardsFrame } from './AwardsFrame.js';
import { CompanyFrame } from './CompanyFrame.js';
import { MarketGraph } from './MarketGraph.js';
import { Standings } from './Standings.js';
import { foundedCompanies } from './series.js';
import { useCarousel, type CarouselStep } from './useCarousel.js';
import styles from './after.module.css';
import { copy, fill } from '../copy/copy.js';

const DWELL = { standings: 8000, market: 10000, company: 6000, awards: 6000 } as const;

type FrameKey = keyof typeof copy.game.after.frames;

/**
 * The after-game screen (#68, #69): four frames that turn over on their own.
 *
 * It sits *behind* the victory beat's last-to-first reveal — that is the
 * payoff, this is what the table talks over afterwards — and a screen nobody
 * has to drive is the right shape for that. Every frame is still a tab, and
 * the transport controls step it by hand: back, play/pause, forward, with the
 * arrow keys and space doing the same. With `prefers-reduced-motion` it starts
 * paused and those controls are the only way through, which is why they are
 * part of the design rather than a convenience bolted onto it.
 *
 * **A frame with an inner cycle holds for all of it.** Two of the four page
 * through something of their own — five companies, five awards at a time — and
 * two cycles running at different rates is how a screen stops being readable.
 * `useCarousel` flattens both into one cursor, so the only thing moving at any
 * moment is the innermost thing.
 */
export function AfterGame({
  record,
  rankings,
  names,
  corporations,
  reader,
}: {
  record: Retrospective | null;
  rankings: readonly RankingRow[];
  names: readonly string[];
  corporations: Record<Industry, CorpView> | undefined;
  reader: Seat | null;
}) {
  const after = copy.game.after;

  const companies: Industry[] = useMemo(
    () => (record ? foundedCompanies(record, INDUSTRIES) : []),
    [record],
  );
  const awards = record?.awards ?? [];
  const awardPages = Math.max(1, Math.ceil(awards.length / AWARDS_PER_PAGE));

  // Which frames exist at all. A game with nothing founded has no company
  // frame, and a game that earned no superlatives has no awards frame — an
  // empty frame in the rotation is worse than one fewer frame.
  const frames = useMemo(() => {
    const list: { key: FrameKey; steps: number; dwell: number }[] = [
      { key: 'standings', steps: 1, dwell: DWELL.standings },
    ];
    if (record && record.turns.length > 1) list.push({ key: 'market', steps: 1, dwell: DWELL.market });
    if (companies.length > 0) list.push({ key: 'companies', steps: companies.length, dwell: DWELL.company });
    if (awards.length > 0) list.push({ key: 'awards', steps: awardPages, dwell: DWELL.awards });
    return list;
  }, [record, companies.length, awards.length, awardPages]);

  const steps: CarouselStep[] = useMemo(
    () =>
      frames.flatMap((frame, index) =>
        Array.from({ length: frame.steps }, (_, step) => ({ frame: index, step, dwell: frame.dwell })),
      ),
    [frames],
  );

  const carousel = useCarousel(steps);
  const { next, previous, toggle } = carousel;

  // The keyboard does what the buttons do. It is bound to the window rather
  // than to the panel because the end screen is the only thing on it, and a
  // player should not have to find a focus ring first.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'BUTTON'].includes(event.target.tagName)) {
        if (event.key === ' ') return;
      }
      if (event.key === 'ArrowRight') next();
      else if (event.key === 'ArrowLeft') previous();
      else if (event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, previous, toggle]);

  const live = frames[carousel.frame] ?? frames[0]!;
  const industry = companies[carousel.step] ?? companies[0];

  return (
    <div className={styles.after} aria-label={after.label}>
      <div className={styles.chrome}>
        <div className={styles.tabs} role="tablist">
          {frames.map((frame, index) => (
            <button
              key={frame.key}
              type="button"
              role="tab"
              aria-selected={index === carousel.frame}
              className={styles.tab}
              data-live={index === carousel.frame}
              onClick={() => carousel.goToFrame(index)}
            >
              {after.frames[frame.key]}
              {index === carousel.frame ? (
                <span className={styles.sliver}>
                  <span className={styles.sliverFill} style={{ width: `${Math.round(carousel.progress * 100)}%` }} />
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div className={styles.transport} aria-label={after.controls.label}>
          <button type="button" className={styles.transportButton} onClick={previous} aria-label={after.controls.previous}>
            <ChevronLeftIcon width={15} height={15} />
          </button>
          <button
            type="button"
            className={styles.transportButton}
            onClick={toggle}
            aria-label={carousel.playing ? after.controls.pause : after.controls.play}
          >
            {carousel.playing ? <PauseIcon width={14} height={14} /> : <PlayIcon width={14} height={14} />}
          </button>
          <button type="button" className={styles.transportButton} onClick={next} aria-label={after.controls.next}>
            <ChevronRightIcon width={15} height={15} />
          </button>
        </div>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <span className={`serif ${styles.panelTitle}`}>{titleFor(live.key, industry, corporations)}</span>
          <span className={styles.panelNote}>{noteFor(live.key, carousel.step, frames, awards.length)}</span>
        </div>

        {live.key === 'standings' ? <Standings rankings={rankings} record={record} names={names} /> : null}
        {live.key === 'market' && record ? (
          <MarketGraph record={record} names={names} corporations={corporations} reader={reader} />
        ) : null}
        {live.key === 'companies' && record && industry ? (
          <CompanyFrame record={record} industry={industry} corp={corporations?.[industry]} names={names} />
        ) : null}
        {live.key === 'awards' ? (
          <AwardsFrame
            awards={awards}
            page={carousel.step}
            pages={awardPages}
            names={names}
            corporations={corporations}
          />
        ) : null}
      </section>

      {record && !record.complete ? <p className={styles.transportHint}>{after.noRecord}</p> : null}
      <p className={styles.transportHint}>{after.controls.hint}</p>
    </div>
  );
}

function titleFor(
  key: FrameKey,
  industry: Industry | undefined,
  corporations: Record<Industry, CorpView> | undefined,
): string {
  const after = copy.game.after;
  if (key === 'standings') return after.standings.title;
  if (key === 'market') return after.market.title;
  if (key === 'awards') return after.awards.title;
  if (!industry) return after.companies.title;
  return corporations?.[industry]?.displayName ?? after.companies.title;
}

function noteFor(
  key: FrameKey,
  step: number,
  frames: readonly { key: string; steps: number }[],
  earned: number,
): string {
  const after = copy.game.after;
  if (key === 'standings') return after.standings.note;
  if (key === 'market') return after.market.note;
  if (key === 'awards') return fill(after.awards.note, { n: earned });
  const total = frames.find((frame) => frame.key === 'companies')?.steps ?? 1;
  return fill(after.companies.counter, { n: step + 1, total });
}
