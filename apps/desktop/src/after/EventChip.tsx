import { INDUSTRY_INFO, type CompanyEventKind, type Industry } from '@boomtown/engine';
import { IndustryMark } from '../game/marks.js';
import styles from './after.module.css';
import { copy } from '../copy/copy.js';

export const CHIP = 18;

/**
 * A company event on a chart's x-axis: the company's own mark, in a chip whose
 * treatment says what happened to it.
 *
 * It replaces a coloured square and the word beside it. Words along an axis
 * are the one thing on this screen that cannot be made not to collide — three
 * corporations folding within a turn of each other printed "FOLDEDOLDED", and
 * every fix is a smaller font — where a mark is a fixed 18px that can be laid
 * out exactly and either fits or is left out. It also says *which* company
 * rather than only that something happened, which the word never did.
 *
 * - **founded** — the mark on the company's colour, the way the board badge
 *   and the tray already draw it.
 * - **founded again** — the same mark, outlined rather than filled: the name
 *   is back, and held stock in it is live again.
 * - **folded** — outlined, faded and struck through.
 *
 * The name and the turn are in the title, because a chart of forty turns has
 * no room to print either and a pointer is the natural way to ask.
 */
export function EventChip({
  industry,
  kind,
  x,
  y,
  label,
}: {
  industry: Industry;
  kind: CompanyEventKind;
  /** Centre of the chip. */
  x: number;
  /** Top of the chip. */
  y: number;
  label: string;
}) {
  const info = INDUSTRY_INFO[industry];
  const solid = kind === 'founded';
  const inset = (CHIP - 12) / 2;

  return (
    <g transform={`translate(${(x - CHIP / 2).toFixed(1)} ${y})`}>
      <rect
        width={CHIP}
        height={CHIP}
        rx="4"
        fill={solid ? info.color : 'var(--surface)'}
        stroke={info.color}
        strokeWidth="1.5"
        opacity={kind === 'folded' ? 0.5 : 1}
      />
      <g transform={`translate(${inset} ${inset})`} opacity={kind === 'folded' ? 0.55 : 1}>
        <IndustryMark industry={industry} color={solid ? info.ink : info.color} size={12} />
      </g>
      {kind === 'folded' ? (
        <line x1="2.5" y1={CHIP - 2.5} x2={CHIP - 2.5} y2="2.5" stroke="var(--ink)" strokeWidth="1.5" opacity="0.7" />
      ) : null}
      <title>{label}</title>
    </g>
  );
}

/**
 * What the three treatments mean, since the words came off the axis. One
 * company stands in for all seven — the shapes are what is being explained,
 * not the colours, which each company owns already.
 */
export function ChipKey({ industry }: { industry: Industry }) {
  const market = copy.game.after.market;
  const kinds: { kind: CompanyEventKind; label: string }[] = [
    { kind: 'founded', label: market.founded },
    { kind: 'refounded', label: market.refounded },
    { kind: 'folded', label: market.folded },
  ];
  return (
    <span className={styles.chipKey}>
      {kinds.map(({ kind, label }) => (
        <span key={kind} className={styles.chipKeyItem}>
          <svg width={CHIP} height={CHIP} aria-hidden="true">
            <EventChip industry={industry} kind={kind} x={CHIP / 2} y={0} label={label} />
          </svg>
          {label}
        </span>
      ))}
    </span>
  );
}
