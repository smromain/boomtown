import { useEffect, useMemo, useRef, useState } from 'react';
import type { CorpSettlement, PlayerView } from '@boomtown/engine';
import { INDUSTRY_INFO } from '@boomtown/engine';
import { IndustryMark } from '../../game/marks.js';
import { Skyline } from '../../art/Skyline.js';
import { soundManager } from '../../audio/soundManager.js';
import { useReducedMotion } from '../useReducedMotion.js';
import styles from '../beats.module.css';

type Line =
  | { readonly kind: 'cash'; readonly amount: number }
  | ({ readonly kind: 'holding' } & CorpSettlement)
  | { readonly kind: 'total'; readonly amount: number };

interface SeatReveal {
  readonly seat: number;
  readonly lines: readonly Line[];
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

const CASH_MS = 650;
const HOLDING_MS = 900;
const TOTAL_MS = 1300;
const HEADLINE_HOLD_MS = 900;

function msFor(line: Line): number {
  switch (line.kind) {
    case 'cash':
      return CASH_MS;
    case 'holding':
      return HOLDING_MS;
    case 'total':
      return TOTAL_MS;
  }
}

/**
 * The victory beat (R6, R13 — composes with the illustration): final
 * standings on the ink curtain, with the skyline behind it and the header's
 * own tagline as the closing line.
 *
 * The reveal runs last-place-to-first (U-victory-cascade): each seat's cash,
 * per-corporation sale, and bonus land one line at a time — "the work" behind
 * the total, not just the number — before the standings row above settles
 * and the next seat's card takes over. The winner's row is the last thing to
 * settle, timed to land with the headline for the reveal's payoff. No
 * auto-timer once everything is shown — the game is over, so the final hold
 * is only ever ended by the player (click / Space / Enter / Escape).
 */
export function VictoryBeat({ view, dismiss }: { view: PlayerView; dismiss: () => void }) {
  const reduced = useReducedMotion();
  const result = view.result;

  const reveals: SeatReveal[] = useMemo(() => {
    if (!result) return [];
    return [...result.rankings].reverse().map((row) => ({
      seat: row.seat,
      lines: [
        { kind: 'cash', amount: row.cash } as const,
        ...row.holdings.map((h) => ({ kind: 'holding', ...h }) as const),
        { kind: 'total', amount: row.total } as const,
      ],
    }));
  }, [result]);

  const flat = useMemo(() => reveals.flatMap((r, seatIdx) => r.lines.map((line) => ({ seatIdx, line }))), [reveals]);
  const starts = useMemo(() => {
    let cursor = 0;
    return reveals.map((r) => {
      const start = cursor;
      cursor += r.lines.length;
      return start;
    });
  }, [reveals]);
  const totalSteps = flat.length;
  const maxStage = totalSteps + 1;

  const [revealed, setRevealed] = useState(() => (reduced ? maxStage : Math.min(1, maxStage)));
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    soundManager.play('victory');
  }, []);

  useEffect(() => {
    if (reduced) return;
    if (revealed > totalSteps) return; // fully revealed — hold until the player dismisses
    const ms = revealed === totalSteps ? HEADLINE_HOLD_MS : msFor(flat[revealed - 1]!.line);
    timer.current = window.setTimeout(() => setRevealed((r) => Math.min(r + 1, maxStage)), ms);
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, reduced]);

  if (!result) return null;

  const nameOf = (seat: number) => view.seats[seat]?.name ?? `Player ${seat + 1}`;
  const headline =
    result.winners.length > 1
      ? `${result.winners.map(nameOf).join(' & ')} tie`
      : `${nameOf(result.winners[0]!)} wins`;

  const activeSeatIdx = revealed >= 1 && revealed <= totalSteps ? flat[revealed - 1]!.seatIdx : null;
  const done = activeSeatIdx === null;

  const advance = (): void => {
    if (reduced || revealed >= maxStage) {
      dismiss();
      return;
    }
    window.clearTimeout(timer.current);
    setRevealed((r) => Math.min(r + 1, maxStage));
  };

  return (
    <div className={styles.curtain} role="dialog" aria-label="Victory" onClick={advance}>
      <Skyline
        tone="chrome"
        style={{
          position: 'absolute',
          inset: 'auto 0 0 0',
          width: '100%',
          height: done ? '40%' : '22%',
          opacity: done ? 0.45 : 0.15,
          transition: 'height 700ms ease, opacity 700ms ease',
        }}
      />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 16 }}>
        <div className={styles.kicker}>{done ? 'game over' : 'tallying the score'}</div>
        <div
          className="serif"
          style={{
            fontSize: 76,
            maxHeight: done ? 100 : 0,
            opacity: done ? 1 : 0,
            transform: done ? 'none' : 'translateY(14px) scale(0.94)',
            overflow: 'hidden',
            transition:
              'opacity 520ms cubic-bezier(0.16, 0.9, 0.2, 1), transform 520ms cubic-bezier(0.16, 0.9, 0.2, 1), max-height 520ms ease',
          }}
        >
          {headline}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 10, width: 420 }}>
          {result.rankings.map((row, i) => {
            const revealIdx = reveals.findIndex((r) => r.seat === row.seat);
            const settled = revealed >= starts[revealIdx]! + reveals[revealIdx]!.lines.length;
            return (
              <div
                key={row.seat}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '9px 4px',
                  borderBottom: '1px solid #2b2621',
                  color: i === 0 ? '#d98a4e' : '#b8ac9f',
                }}
              >
                <span className="serif" style={{ fontSize: 16, opacity: settled ? 1 : 0.35, transition: 'opacity 500ms ease' }}>
                  {i + 1}. {settled ? nameOf(row.seat) : '?'}
                </span>
                <span className="tabnum" style={{ fontSize: 16, opacity: settled ? 1 : 0.35, transition: 'opacity 500ms ease' }}>
                  {settled ? `$${row.total.toLocaleString()}` : '···'}
                </span>
              </div>
            );
          })}
        </div>

        {activeSeatIdx != null && (
          <SeatCard
            key={activeSeatIdx}
            reveal={reveals[activeSeatIdx]!}
            rank={result.rankings.findIndex((r) => r.seat === reveals[activeSeatIdx]!.seat) + 1}
            visibleLines={revealed - starts[activeSeatIdx]!}
            nameOf={nameOf}
            corpName={(industry) => view.corporations[industry].displayName}
          />
        )}

        <div
          className={styles.kicker}
          style={{
            marginTop: done ? 18 : 0,
            color: '#6f665d',
            maxHeight: done ? 20 : 0,
            opacity: done ? 1 : 0,
            overflow: 'hidden',
            transition: 'opacity 400ms ease, max-height 400ms ease, margin-top 400ms ease',
          }}
        >
          seven start-ups, one skyline
        </div>
      </div>
      <span className={styles.hint}>{done ? 'click or press space to continue' : 'click or press space to advance'}</span>
    </div>
  );
}

function SeatCard({
  reveal,
  rank,
  visibleLines,
  nameOf,
  corpName,
}: {
  reveal: SeatReveal;
  rank: number;
  visibleLines: number;
  nameOf: (seat: number) => string;
  corpName: (industry: CorpSettlement['industry']) => string;
}) {
  // Whose numbers these are stays back until they've been earned — the name
  // pops in with the total, not before, so the standings can't be skimmed
  // ahead of the math (U-victory-cascade, refinement: hide names until settled).
  const identityRevealed = visibleLines >= reveal.lines.length;
  return (
    <div
      className={styles.rise}
      style={{
        marginTop: 18,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        minHeight: 128,
        width: 'min(1400px, 94vw)',
      }}
    >
      <div key={identityRevealed ? 'name' : 'placeholder'} className={`serif ${styles.rise}`} style={{ fontSize: 20, color: '#d8cfc3' }}>
        {identityRevealed ? `${rank}. ${nameOf(reveal.seat)}` : `${ordinal(rank)} place`}
      </div>
      {reveal.lines.map((line, li) => (
        <div
          key={li}
          style={{
            fontSize: 13,
            color: line.kind === 'total' ? '#faf6f0' : '#9c9086',
            fontWeight: line.kind === 'total' ? 600 : 400,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            width: '100%',
            whiteSpace: 'nowrap',
            opacity: li < visibleLines ? 1 : 0,
            transform: li < visibleLines ? 'none' : 'translateY(8px)',
            maxHeight: li < visibleLines ? 28 : 0,
            overflowY: 'hidden',
            transition: 'opacity 380ms ease, transform 380ms ease, max-height 380ms ease',
          }}
        >
          {renderLine(line, corpName)}
        </div>
      ))}
    </div>
  );
}

function renderLine(line: Line, corpName: (industry: CorpSettlement['industry']) => string) {
  switch (line.kind) {
    case 'cash':
      return <span>cash on hand: ${line.amount.toLocaleString()}</span>;
    case 'total':
      return <span className="tabnum">total: ${line.amount.toLocaleString()}</span>;
    case 'holding': {
      const shareWord = line.shares === 1 ? 'share' : 'shares';
      return (
        <>
          <IndustryMark industry={line.industry} color={INDUSTRY_INFO[line.industry].color} size={20} />
          <span>
            {line.shares} {shareWord} of {corpName(line.industry)} at ${line.price.toLocaleString()} each = $
            {line.saleValue.toLocaleString()}
            {line.bonus > 0 ? ` + $${line.bonus.toLocaleString()} bonus` : ''}
          </span>
        </>
      );
    }
  }
}
