import { INDUSTRY_INFO, type Retrospective, type Seat } from '@boomtown/engine';
import { dashFor, linePath, netWorthSeries, niceMax } from './series.js';
import styles from './after.module.css';
import { copy } from '../copy/copy.js';

const W = 1000;
const H = 330;
const PAD_L = 58;
const PAD_R = 10;
const PAD_T = 30;
const PAD_B = 54;

const money = (n: number): string => `$${n.toLocaleString()}`;

/**
 * Frame two: every seat's net worth, turn by turn, with the company timeline
 * underneath it.
 *
 * The seat being read is in the accent and the rest are recessive ink, every
 * line direct-labelled in the legend. Identity is the label and the dash; the
 * accent only says which line you are following. That is not a stylistic
 * preference — a seat palette that is both colourblind-safe and distinct from
 * the seven corporation colours does not exist at six seats, so the colour you
 * *do* see here belongs to companies, which already own it.
 *
 * A line that doubles in a turn is answering something, so the foundings and
 * the foldings are marked rather than left to be inferred from a kink.
 */
export function MarketGraph({
  record,
  names,
  reader,
}: {
  record: Retrospective;
  names: readonly string[];
  reader: Seat | null;
}) {
  const after = copy.game.after.market;
  const seats = record.turns[0]?.seats.map((_, seat) => seat) ?? [];
  const series = seats.map((seat) => netWorthSeries(record, seat));
  const lastTurn = record.turns.length - 1;
  const peak = Math.max(1, ...series.flat());
  const floor = Math.min(...series.flat(), 0);
  const max = niceMax(peak, 5000);

  const x = (turn: number): number => PAD_L + (lastTurn <= 0 ? 0 : (turn / lastTurn) * (W - PAD_L - PAD_R));
  const y = (value: number): number =>
    H - PAD_B - ((value - floor) / (max - floor || 1)) * (H - PAD_B - PAD_T);

  const step = Math.max(1, Math.ceil(lastTurn / 12));
  const grid: number[] = [];
  for (let value = 5000; value < max; value += 5000) grid.push(value);

  const final = seats
    .map((seat) => ({ seat, total: series[seat]![lastTurn] ?? 0 }))
    .sort((a, b) => b.total - a.total);
  const lit = reader ?? final[0]?.seat ?? 0;

  return (
    <div className={styles.chartRow}>
      <div className={styles.chartMain}>
        <svg className={styles.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={after.title}>
          {grid.map((value) => (
            <g key={value}>
              <line
                x1={PAD_L}
                y1={y(value)}
                x2={W - PAD_R}
                y2={y(value)}
                stroke="var(--rule)"
                strokeDasharray="2 5"
              />
              <text x={PAD_L - 8} y={y(value)} fontSize="10" fill="var(--muted)" textAnchor="end" dominantBaseline="middle" className="tabnum">
                {money(value)}
              </text>
            </g>
          ))}

          <line x1={PAD_L} y1={y(floor)} x2={W - PAD_R} y2={y(floor)} stroke="var(--rule)" />

          {record.turns.map((turn) =>
            turn.turn % step === 0 ? (
              <text
                key={turn.turn}
                x={x(turn.turn)}
                y={y(floor) + 16}
                fontSize="10"
                fill="var(--muted)"
                textAnchor="middle"
                className="tabnum"
              >
                {turn.turn}
              </text>
            ) : null,
          )}

          {/* The company timeline. Colour is which company; the glyph is what
              happened to it, and the labels alternate rows so neighbouring
              turns never collide. */}
          {record.companies.map((event, index) => {
            const info = INDUSTRY_INFO[event.industry];
            const at = x(event.turn);
            const label = event.kind === 'folded' ? after.folded : event.kind === 'refounded' ? after.refounded : after.founded;
            const row = index % 2 === 0 ? PAD_T - 18 : PAD_T - 6;
            return (
              <g key={`${event.industry}-${event.kind}-${event.turn}-${index}`}>
                <line
                  x1={at}
                  y1={PAD_T - 2}
                  x2={at}
                  y2={y(floor)}
                  stroke={event.kind === 'folded' ? 'var(--muted)' : info.color}
                  strokeDasharray={event.kind === 'folded' ? '3 3' : '1 4'}
                  opacity="0.7"
                />
                {event.kind === 'folded' ? null : (
                  <circle
                    cx={at}
                    cy={y(floor)}
                    r="4"
                    fill={event.kind === 'refounded' ? 'var(--surface)' : info.color}
                    stroke={info.color}
                    strokeWidth="1.8"
                  />
                )}
                <rect x={at - 3} y={row - 7} width="6" height="6" rx="1.5" fill={info.color} />
                <text x={at + 6} y={row - 2} fontSize="8.5" fill="var(--muted)" style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {label}
                </text>
              </g>
            );
          })}

          {seats.map((seat) => (
            <path
              key={seat}
              d={linePath(record.turns.map((turn) => [x(turn.turn), y(series[seat]![turn.turn] ?? 0)] as const))}
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
      </div>
    </div>
  );
}
