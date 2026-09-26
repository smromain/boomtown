import { memo } from 'react';
import { type CorpView, type Industry, type Retrospective, type Seat } from '@boomtown/engine';
import { CHIP, ChipKey, EventChip } from './EventChip.js';
import { IndustryMark } from '../game/marks.js';
import { industryTheme } from '../game/industryTheme.js';
import { dashFor, linePath, moneyAxis, netWorthSeries, placeLabels } from './series.js';
import styles from './after.module.css';
import { copy } from '../copy/copy.js';

const W = 1000;
const H = 330;
const PAD_L = 62;
const PAD_R = 10;
const PAD_T = 16;
// Room under the axis for the turn numbers and two rows of company marks.
const PAD_B = 86;

const money = (n: number): string => `$${n.toLocaleString()}`;

/**
 * Frame two: every seat's net worth, turn by turn, with the company timeline
 * along the top.
 *
 * The seat being read is in the accent and the rest are recessive ink, every
 * line direct-labelled in the legend. Identity is the label and the dash; the
 * accent only says which line you are following. That is not a stylistic
 * preference — a seat palette that is both colourblind-safe and distinct from
 * the seven corporation colours does not exist at six seats, so the colour you
 * *do* see here belongs to companies, which already own it.
 *
 * **The line ends where the seats did.** Settlement pays every bonus and buys
 * back every share at once, and a line that stopped before it drew the game's
 * winner in second place whenever the last turn's liquidation was what won it.
 * So settlement is the last point on every line, set a short run to the right
 * of the last turn played and marked off by its own rule, so the jump reads as
 * the bank paying out rather than as one more turn. The figure beside each
 * name is that point.
 */
export const MarketGraph = memo(function MarketGraph({
  record,
  names,
  corporations,
  reader,
}: {
  record: Retrospective;
  names: readonly string[];
  corporations: Record<Industry, CorpView> | undefined;
  reader: Seat | null;
}) {
  const after = copy.game.after.market;
  const seats = record.turns[0]?.seats.map((_, seat) => seat) ?? [];
  const series = seats.map((seat) => netWorthSeries(record, seat));

  // The settlement record is the last one when the game finished. It is drawn,
  // but not as one more turn: it sits a short run past the last turn played,
  // under its own label, so the axis still counts turns up to it.
  const played = record.turns.slice(0, record.settled ? -1 : undefined);
  const lastPlayed = Math.max(0, played.length - 1);
  const settledAt = record.settled ? lastPlayed + Math.max(1, Math.round(lastPlayed / 24)) : null;
  const span = settledAt ?? lastPlayed;
  const axis = moneyAxis(Math.min(...series.flat()), Math.max(1, ...series.flat()));

  const x = (turn: number): number => PAD_L + (span <= 0 ? 0 : (turn / span) * (W - PAD_L - PAD_R));
  const y = (value: number): number =>
    H - PAD_B - ((value - axis.floor) / (axis.max - axis.floor || 1)) * (H - PAD_B - PAD_T);

  const step = Math.max(1, Math.ceil(lastPlayed / 12));
  // A turn number too close to the settlement label would collide with it.
  const clearOfSettled = (turn: number): boolean => settledAt === null || x(settledAt) - x(turn) >= 48;

  const final = seats
    .map((seat) => ({ seat, total: series[seat]![series[seat]!.length - 1] ?? 0 }))
    .sort((a, b) => b.total - a.total);
  const lit = reader ?? final[0]?.seat ?? 0;

  // Only events that happened while the game was being played; a fold on the
  // settlement record would sit off the end of the axis.
  const events = record.companies.filter((event) => event.turn <= lastPlayed);
  const labelFor = (kind: string): string =>
    kind === 'folded' ? after.folded : kind === 'refounded' ? after.refounded : after.founded;
  const nameOf = (industry: Industry): string =>
    corporations?.[industry]?.baseName ?? corporations?.[industry]?.displayName ?? '';
  // Marks are a fixed width, so the layout is exact rather than an estimate of
  // how wide a word will render.
  const placed = placeLabels(
    events.map((event) => ({ x: x(event.turn), width: CHIP })),
    2,
    3,
  );

  return (
    <div className={styles.chartRow}>
      <div className={styles.chartMain}>
        <svg className={styles.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={after.title}>
          {axis.lines.map((value) => (
            <g key={value}>
              <line x1={PAD_L} y1={y(value)} x2={W - PAD_R} y2={y(value)} stroke="var(--rule)" strokeDasharray="2 5" />
              <text
                x={PAD_L - 8}
                y={y(value)}
                fontSize="10"
                fill="var(--muted)"
                textAnchor="end"
                dominantBaseline="middle"
                className="tabnum"
              >
                {money(value)}
              </text>
            </g>
          ))}

          <line x1={PAD_L} y1={y(axis.floor)} x2={W - PAD_R} y2={y(axis.floor)} stroke="var(--rule)" />
          <text x={PAD_L - 8} y={y(axis.floor)} fontSize="10" fill="var(--muted)" textAnchor="end" dominantBaseline="middle" className="tabnum">
            {money(axis.floor)}
          </text>

          {played.map((turn) =>
            turn.turn % step === 0 && clearOfSettled(turn.turn) ? (
              <text
                key={turn.turn}
                x={x(turn.turn)}
                y={y(axis.floor) + 17}
                fontSize="10"
                fill="var(--muted)"
                textAnchor="middle"
                className="tabnum"
              >
                {turn.turn}
              </text>
            ) : null,
          )}

          {settledAt !== null ? (
            <g data-settled-rule="">
              <line
                x1={x(settledAt)}
                y1={PAD_T}
                x2={x(settledAt)}
                y2={y(axis.floor)}
                stroke="var(--muted)"
                strokeDasharray="1 3"
                opacity="0.7"
              />
              <text x={W - 2} y={y(axis.floor) + 17} fontSize="10" fill="var(--muted)" textAnchor="end">
                {after.settled}
              </text>
            </g>
          ) : null}

          {/* The company timeline, on the axis: one mark per event, laid out
              exactly and stacked into a second row when two land together. A
              mark that fits in neither keeps its rule and its hover text. */}
          {events.map((event, index) => {
            const info = industryTheme(event.industry);
            const at = x(event.turn);
            const slot = placed.find((entry) => entry.index === index);
            return (
              <g key={`${event.industry}-${event.kind}-${event.turn}-${index}`}>
                <line
                  x1={at}
                  y1={PAD_T}
                  x2={at}
                  y2={y(axis.floor) + (slot ? 8 + slot.row * (CHIP + 6) : 0)}
                  stroke={event.kind === 'folded' ? 'var(--muted)' : info.onPaper}
                  strokeDasharray={event.kind === 'folded' ? '3 3' : '1 4'}
                  opacity="0.55"
                />
                {slot ? (
                  <EventChip
                    industry={event.industry}
                    kind={event.kind}
                    x={at}
                    y={y(axis.floor) + 30 + slot.row * (CHIP + 6)}
                    label={`${nameOf(event.industry)} — ${labelFor(event.kind)}, turn ${event.turn}`}
                  />
                ) : (
                  // Not a bare dot: a coloured dot this small is one no
                  // colourblind player can place (#19), so the overflow mark
                  // is the industry's glyph, in the shade that reads on paper.
                  <g data-overflow-mark={event.industry} transform={`translate(${(at - 7).toFixed(1)} ${(y(axis.floor) - 7).toFixed(1)})`}>
                    <title>{`${nameOf(event.industry)} — ${labelFor(event.kind)}, turn ${event.turn}`}</title>
                    <IndustryMark industry={event.industry} color={info.onPaper} size={10} />
                  </g>
                )}
              </g>
            );
          })}

          {seats.map((seat) => (
            <path
              key={seat}
              d={linePath([
                ...played.map((turn) => [x(turn.turn), y(series[seat]![turn.turn] ?? axis.floor)] as const),
                ...(settledAt !== null
                  ? [[x(settledAt), y(series[seat]![series[seat]!.length - 1] ?? axis.floor)] as const]
                  : []),
              ])}
              fill="none"
              stroke={seat === lit ? 'var(--accent)' : 'var(--ink)'}
              strokeWidth={seat === lit ? 2.5 : 1.5}
              strokeDasharray={dashFor(seat)}
              opacity={seat === lit ? 1 : 0.34}
              strokeLinejoin="round"
              strokeLinecap="round"
            >
              <title>{names[seat] ?? ''}</title>
            </path>
          ))}
        </svg>
      </div>

      <div className={styles.side}>
        {final.map((row, index) => (
          <div key={row.seat} className={styles.legendRow}>
            <svg width="24" height="8" aria-hidden="true">
              <line
                x1="0"
                y1="4"
                x2="24"
                y2="4"
                stroke={row.seat === lit ? 'var(--accent)' : 'var(--ink)'}
                strokeWidth={row.seat === lit ? 2.5 : 1.5}
                strokeDasharray={dashFor(row.seat)}
                opacity={row.seat === lit ? 1 : 0.4}
                strokeLinecap="round"
              />
            </svg>
            <span className={`tabnum ${styles.legendShares}`}>{index + 1}</span>
            <span className={styles.legendName}>{names[row.seat] ?? ''}</span>
            <span className={`tabnum ${styles.legendValue}`}>{money(row.total)}</span>
          </div>
        ))}
        {events.length > 0 ? <ChipKey industry={events[0]!.industry} /> : null}
        <span className={styles.sideNote}>{record.settled ? after.settledNote : ''}</span>
      </div>
    </div>
  );
});
