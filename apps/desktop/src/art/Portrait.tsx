/**
 * Drawn portraits for the Game Night skin (prototype). Nine heads, each just a
 * head: shoulders cut off by the round frame read as a stray shape. The head
 * comes from the name's length plus the seat number, modulo the number of heads,
 * so a table of default names (all the same length) still mixes. The ring colour
 * is the seat's.
 */
import { drawingsIn } from './drawings.js';
import styles from './portrait.module.css';

/** The heads, in file-name order (`drawings/portraits/`), each wrapped in the wobble filter once. */
const FACES = drawingsIn('portraits').map((art) => ({ __html: `<g class="gn-rough">${art}</g>` }));

/** The ring colour behind each seat's portrait. */
export const SEAT_COLOURS: readonly string[] = ['#355C99', '#C64E25', '#4A9471', '#D7A329', '#AC7CEF', '#66CAD8'];

/** Which head a seat gets. */
export function faceIndex(name: string, seat: number): number {
  return (name.length + seat) % FACES.length;
}

/** A head that belongs to nobody at the table — the tutorial's host — with its own ring colour. */
export interface Guest {
  /** Index into the heads, in file-name order. */
  readonly face: number;
  readonly ring: string;
}

export function Portrait({
  seat,
  name,
  size = 36,
  guest,
}: {
  seat: number;
  name: string;
  size?: number;
  guest?: Guest;
}) {
  const face = FACES[guest ? guest.face % FACES.length : faceIndex(name, seat)]!;
  return (
    <span
      className={styles.portrait}
      style={{ width: size, height: size, background: guest?.ring ?? SEAT_COLOURS[seat % SEAT_COLOURS.length] }}
      aria-hidden
    >
      <svg viewBox="0 0 40 40">
        {/* the heads are drawn around (20, 17); enlarge them to fill the ring */}
        <g transform="translate(20 20) scale(1.25) translate(-20 -17)" dangerouslySetInnerHTML={face} />
      </svg>
    </span>
  );
}
