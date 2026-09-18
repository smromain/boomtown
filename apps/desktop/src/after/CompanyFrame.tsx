import { memo } from 'react';
import { INDUSTRY_INFO, type CorpView, type Industry, type Retrospective } from '@boomtown/engine';
import { IndustryMark } from '../game/marks.js';
import { CHIP, EventChip } from './EventChip.js';
import {
  companyValueSeries,
  dashFor,
  holderRuns,
  leadChanges,
  linePath,
  liveSpans,
  niceMax,
  seatValueSeries,
} from './series.js';
import styles from './after.module.css';
import { copy, fill } from '../copy/copy.js';

const W = 1000;
const H = 396;
const PAD_L = 56;
const PAD_R = 12;
const STRIP_Y = 30;
const STRIP_H = 46;
const PLOT_Y = STRIP_Y + STRIP_H + 38;
// Room under the axis for the turn numbers, the company's own marks, and the
// two holder lanes.
const PLOT_B = 116;

const money = (n: number): string => `$${n.toLocaleString()}`;

/**
 * Frame three: one company, with a band for what it was worth and a line per
 * seat for whose it was.
 *
 * This began as stacked bars and the table killed them, for two reasons with
 * one root. A stack has to be *ordered*, and every order is a lie for some
 * part of the game: order by the final holding and a seat who led for twenty
 * turns is drawn in the wrong step throughout; order it turn by turn and the
 * bands cross every time the majority moves, which at six seats is most turns.
 * Lines have no order to get wrong — and the crossing that broke the stack is
 * the thing worth seeing, so it is marked with a ◆ and counted in the panel.
 *
 * **Two heights, not one axis.** The company's total is six times any one
 * seat's line at a six-handed table, so a shared scale would flatten the fight
 * into the bottom sixth of the plot. The strip is the company on its own
 * scale; the plot under it is the seats on theirs. They share the turn axis,
 * and every rule is drawn through both.
 *
 * Under the turns, two lanes say plainly who the two bonuses would pay. A tie
 * is kept as a tie, because `docs/rules.md` pays it as one.
 */
export const CompanyFrame = memo(function CompanyFrame({
  record,
  industry,
  corp,
  names,
}: {
  record: Retrospective;
  industry: Industry;
  corp: CorpView | undefined;
  names: readonly string[];
}) {
  const after = copy.game.after.companies;
  const market = copy.game.after.market;
  const info = INDUSTRY_INFO[industry];
  const seats = record.turns[0]?.seats.map((_, seat) => seat) ?? [];
  const spans = liveSpans(record, industry);
  const lastTurn = record.turns.length - 1;

  const company = companyValueSeries(record, industry);
  const perSeat = seats.map((seat) => seatValueSeries(record, industry, seat));
  const totalMax = niceMax(Math.max(1, ...company), 5000);
  const seatMax = niceMax(Math.max(1, ...perSeat.flat()), 2000);

  const x = (turn: number): number => PAD_L + (lastTurn <= 0 ? 0 : (turn / lastTurn) * (W - PAD_L - PAD_R));
  const ys = (value: number): number => STRIP_Y + STRIP_H - (value / totalMax) * STRIP_H;
  const y = (value: number): number => H - PLOT_B - (value / seatMax) * (H - PLOT_B - PLOT_Y);

  const lastLive = spans[spans.length - 1]?.to ?? 0;
  const closing = record.turns[lastLive];
  const held = closing ? seats.map((seat) => closing.seats[seat]!.holdings[industry]) : [];
  const ranked = seats
    .map((seat) => ({ seat, shares: held[seat] ?? 0, value: perSeat[seat]![lastLive] ?? 0 }))
    .filter((row) => row.shares > 0)
    .sort((a, b) => b.shares - a.shares || a.seat - b.seat);

  const changes = leadChanges(record, industry);
  const step = Math.max(1, Math.ceil(lastTurn / 12));
  const gridStep = seatMax <= 9000 ? 2000 : 5000;
  const grid: number[] = [];
  for (let value = gridStep; value <= seatMax; value += gridStep) grid.push(value);

  if (spans.length === 0) {
    return (
      <div className={styles.empty}>
        <span>{after.neverFounded}</span>
      </div>
    );
  }

  const founded = spans[0]!.from;
  const alive = spans[spans.length - 1]!.to >= lastTurn;
  const bank = corp?.bankShares ?? 0;

  return (
    <div className={styles.chartRow}>
      <div className={styles.chartMain}>
        <svg className={styles.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={corp?.displayName ?? industry}>
          {/* the company: its whole worth, as one band */}
          <text x={PAD_L} y={STRIP_Y - 10} fontSize="9" fill="var(--muted)" style={{ letterSpacing: '0.11em', textTransform: 'uppercase' }}>
            {fill(after.theCompany, { peak: money(Math.max(...company)) })}
          </text>
          {spans.map((span) => {
            const points = record.turns
              .slice(span.from, span.to + 1)
              .map((turn) => [x(turn.turn), ys(company[turn.turn] ?? 0)] as const);
            if (points.length < 2) return null;
            const path = linePath(points);
            return (
              <g key={`band-${span.from}`}>
                <path
                  d={`${path} L${points[points.length - 1]![0].toFixed(1)} ${ys(0)} L${points[0]![0].toFixed(1)} ${ys(0)} Z`}
                  fill={info.color}
                  opacity="0.18"
                />
                <path d={path} fill="none" stroke={info.color} strokeWidth="1.5" />
              </g>
            );
          })}
          <line x1={PAD_L} y1={ys(0)} x2={W - PAD_R} y2={ys(0)} stroke="var(--rule)" />

          {/* the seats: one line each, on their own scale */}
          <text x={PAD_L} y={PLOT_Y - 20} fontSize="9" fill="var(--muted)" style={{ letterSpacing: '0.11em', textTransform: 'uppercase' }}>
            {after.eachSeat}
          </text>
          {grid.map((value) => (
            <g key={value}>
              <line x1={PAD_L} y1={y(value)} x2={W - PAD_R} y2={y(value)} stroke="var(--rule)" strokeDasharray="2 5" />
              <text x={PAD_L - 8} y={y(value)} fontSize="9" fill="var(--muted)" textAnchor="end" dominantBaseline="middle" className="tabnum">
                {money(value)}
              </text>
            </g>
          ))}

          {seats.map((seat) =>
            spans.map((span) => {
              const points = record.turns
                .slice(span.from, span.to + 1)
                .map((turn) => [x(turn.turn), y(perSeat[seat]![turn.turn] ?? 0)] as const);
              if (points.length < 2) return null;
              return (
                <path
                  key={`${seat}-${span.from}`}
                  d={linePath(points)}
                  fill="none"
                  stroke={info.color}
                  strokeWidth="2"
                  strokeDasharray={dashFor(seat)}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                >
                  <title>{names[seat] ?? ''}</title>
                </path>
              );
            }),
          )}

          <line x1={PAD_L} y1={y(0)} x2={W - PAD_R} y2={y(0)} stroke="var(--rule)" />

          {changes.map((turn) => (
            <path
              key={`lead-${turn}`}
              d={`M${x(turn)} ${y(0) + 4} l4.5 5.5 l-4.5 5.5 l-4.5 -5.5 Z`}
              fill="var(--accent)"
            />
          ))}

          {spans.map((span, index) => (
            <g key={`mark-${span.from}`}>
              <line x1={x(span.from)} y1={STRIP_Y} x2={x(span.from)} y2={y(0) + 26} stroke={info.color} strokeDasharray="1 4" opacity="0.7" />
              <EventChip
                industry={industry}
                kind={index === 0 ? 'founded' : 'refounded'}
                x={x(span.from)}
                y={y(0) + 26}
                label={`${corp?.displayName ?? ''} — ${index === 0 ? market.founded : market.refounded}, turn ${span.from}`}
              />
              {span.to < lastTurn ? (
                <g>
                  <line x1={x(span.to)} y1={STRIP_Y} x2={x(span.to)} y2={y(0) + 26} stroke="var(--muted)" strokeDasharray="3 3" />
                  <EventChip
                    industry={industry}
                    kind="folded"
                    x={x(span.to)}
                    y={y(0) + 26}
                    label={`${corp?.displayName ?? ''} — ${market.folded}, turn ${span.to}`}
                  />
                </g>
              ) : null}
            </g>
          ))}

          {record.turns.map((turn) =>
            turn.turn % step === 0 ? (
              <text key={turn.turn} x={x(turn.turn)} y={y(0) + 22} fontSize="10" fill="var(--muted)" textAnchor="middle" className="tabnum">
                {turn.turn}
              </text>
            ) : null,
          )}

          {/* who the bonuses would pay, turn by turn, as runs */}
          {([0, 1] as const).map((lane) => {
            const top = y(0) + 26 + CHIP + 10 + lane * 23;
            const half = lastTurn <= 0 ? 0 : (W - PAD_L - PAD_R) / lastTurn / 2;
            return (
              <g key={`lane-${lane}`}>
                {/* In the left gutter, not at the right edge: a run that
                    lasts to the end of the game reaches that edge, and the
                    label was printing on top of it. */}
                <text x={PAD_L - 8} y={top + 9} fontSize="8" fill="var(--muted)" textAnchor="end" dominantBaseline="middle" style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {lane === 0 ? after.largest : after.second}
                </text>
                {holderRuns(record, industry, lane).map((run) => {
                  const x0 = Math.max(PAD_L, x(run.from) - half);
                  const x1 = Math.min(W - PAD_R, x(run.to) + half);
                  const width = Math.max(0, x1 - x0 - 2);
                  const label = run.seats.map((seat) => names[seat] ?? '').join(' · ');
                  const fits = width >= 7.2 * label.length + 8;
                  const initial = run.seats.length === 1 && width >= 15 ? label.slice(0, 1) : '';
                  return (
                    <g key={`${lane}-${run.from}`}>
                      <rect x={x0 + 1} y={top} width={width} height="18" rx="2.5" fill={info.color} opacity={lane === 0 ? 0.26 : 0.13}>
                        <title>{label}</title>
                      </rect>
                      {fits || initial ? (
                        <text x={x0 + 1 + width / 2} y={top + 10} fontSize="9.5" fill="var(--ink)" textAnchor="middle" dominantBaseline="middle" pointerEvents="none">
                          {fits ? label : initial}
                        </text>
                      ) : null}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      <div className={styles.side}>
        <div className={styles.sideHead}>
          <IndustryMark industry={industry} color={info.color} size={24} />
          <span className={`serif ${styles.sideName}`}>{corp?.displayName ?? corp?.baseName ?? ''}</span>
        </div>
        {corp?.flavour ? <span className={styles.sideFlavour}>{corp.flavour}</span> : null}
        <div>
          <span className={`tabnum ${styles.sideTotal}`}>{money(company[lastLive] ?? 0)}</span>{' '}
          <span className={styles.sideNote}>{after.held}</span>
        </div>
        {ranked.map((row) => (
          <div key={row.seat} className={styles.legendRow}>
            <svg width="24" height="8" aria-hidden="true">
              <line x1="0" y1="4" x2="24" y2="4" stroke={info.color} strokeWidth="2" strokeDasharray={dashFor(row.seat)} strokeLinecap="round" />
            </svg>
            <span />
            <span className={styles.legendName}>{names[row.seat] ?? ''}</span>
            <span className={`tabnum ${styles.legendValue}`}>{money(row.value)}</span>
          </div>
        ))}
        <span className={styles.sideNote}>
          {alive
            ? fill(after.trading, { founded, n: bank })
            : fill(after.folded, { founded, folded: lastLive })}
        </span>
        <span className={styles.sideNote}>
          {changes.length === 0
            ? after.leadNever
            : changes.length === 1
              ? after.leadOnce
              : fill(after.leadMany, { n: changes.length })}
        </span>
      </div>
    </div>
  );
});
