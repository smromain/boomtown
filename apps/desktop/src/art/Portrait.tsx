/**
 * Drawn portraits for the Game Night skin (prototype). A seat's portrait is
 * picked by its position at the table, so it is stable for a whole game and
 * needs nothing from the engine. Six drawings for up to six seats, each just a
 * head: shoulders cut off by the round frame read as a stray shape.
 */
import styles from './portrait.module.css';

const FACES: readonly string[] = [
  "<g class=\"gn-rough\"><circle cx=\"20\" cy=\"18\" r=\"8.5\" fill=\"var(--gn-skin1)\" stroke=\"var(--gn-line)\" stroke-width=\"1.6\"/><path d=\"M11 20 q-2 -13 9 -13 q11 0 9 13 l-3 -6 q-6 1 -12 -3z\" fill=\"#3b2a22\" stroke=\"var(--gn-line)\" stroke-width=\"1.4\"/><circle cx=\"17\" cy=\"19\" r=\"1\" fill=\"var(--gn-line)\"/><circle cx=\"23\" cy=\"19\" r=\"1\" fill=\"var(--gn-line)\"/><path d=\"M17.5 23 q2.5 2 5 0\" fill=\"none\" stroke=\"var(--gn-line)\" stroke-width=\"1.2\" stroke-linecap=\"round\"/></g>",
  "<g class=\"gn-rough\"><circle cx=\"20\" cy=\"18\" r=\"8.5\" fill=\"var(--gn-skin3)\" stroke=\"var(--gn-line)\" stroke-width=\"1.6\"/><path d=\"M12 15 q8 -10 16 0 q-8 -3 -16 0z\" fill=\"#1d1715\" stroke=\"var(--gn-line)\" stroke-width=\"1.4\"/><path d=\"M13 21 q7 10 14 0 q-7 3 -14 0z\" fill=\"#1d1715\"/><circle cx=\"17\" cy=\"18.5\" r=\"1\" fill=\"var(--gn-line)\"/><circle cx=\"23\" cy=\"18.5\" r=\"1\" fill=\"var(--gn-line)\"/></g>",
  "<g class=\"gn-rough\"><circle cx=\"20\" cy=\"5.5\" r=\"4\" fill=\"#241a17\" stroke=\"var(--gn-line)\" stroke-width=\"1.4\"/><circle cx=\"20\" cy=\"18\" r=\"8.5\" fill=\"var(--gn-skin2)\" stroke=\"var(--gn-line)\" stroke-width=\"1.6\"/><path d=\"M11.5 17 q1 -9 8.5 -9 q7.5 0 8.5 9 q-5 -5 -17 0z\" fill=\"#241a17\" stroke=\"var(--gn-line)\" stroke-width=\"1.4\"/><circle cx=\"17\" cy=\"19\" r=\"1\" fill=\"var(--gn-line)\"/><circle cx=\"23\" cy=\"19\" r=\"1\" fill=\"var(--gn-line)\"/><path d=\"M17.5 23 q2.5 1.6 5 0\" fill=\"none\" stroke=\"var(--gn-line)\" stroke-width=\"1.2\" stroke-linecap=\"round\"/></g>",
  "<g class=\"gn-rough\"><circle cx=\"20\" cy=\"18\" r=\"8.5\" fill=\"var(--gn-skin1)\" stroke=\"var(--gn-line)\" stroke-width=\"1.6\"/><path d=\"M11 16 q-1 -4 3 -5 q1 -4 5 -3 q3 -3 6 0 q4 -1 4 4 q3 2 1 5 q-3 -3 -6 -2 q-3 -2 -6 0 q-4 -2 -7 1z\" fill=\"#c9793a\" stroke=\"var(--gn-line)\" stroke-width=\"1.3\"/><circle cx=\"16.5\" cy=\"19\" r=\"2.6\" fill=\"none\" stroke=\"var(--gn-line)\" stroke-width=\"1.3\"/><circle cx=\"23.5\" cy=\"19\" r=\"2.6\" fill=\"none\" stroke=\"var(--gn-line)\" stroke-width=\"1.3\"/><path d=\"M19.1 19 h1.8\" stroke=\"var(--gn-line)\" stroke-width=\"1.2\"/><path d=\"M18 23.5 q2 1.4 4 0\" fill=\"none\" stroke=\"var(--gn-line)\" stroke-width=\"1.2\" stroke-linecap=\"round\"/></g>",
  "<g class=\"gn-rough\"><circle cx=\"20\" cy=\"18.5\" r=\"8.5\" fill=\"var(--gn-skin2)\" stroke=\"var(--gn-line)\" stroke-width=\"1.6\"/><path d=\"M11 16 q9 -11 18 0 z\" fill=\"#c64e25\" stroke=\"var(--gn-line)\" stroke-width=\"1.4\"/><path d=\"M27 15.5 h6 q0 2 -6 2z\" fill=\"#c64e25\" stroke=\"var(--gn-line)\" stroke-width=\"1.2\"/><circle cx=\"17\" cy=\"19.5\" r=\"1\" fill=\"var(--gn-line)\"/><circle cx=\"23\" cy=\"19.5\" r=\"1\" fill=\"var(--gn-line)\"/><path d=\"M17.5 23.5 q2.5 2 5 0\" fill=\"none\" stroke=\"var(--gn-line)\" stroke-width=\"1.2\" stroke-linecap=\"round\"/></g>",
  "<g class=\"gn-rough\"><path d=\"M10 30 q-3 -16 4 -21 q6 -4 12 0 q7 5 4 21 q-3 -4 -2 -9 l-16 0 q1 5 -2 9z\" fill=\"#6b3a1f\" stroke=\"var(--gn-line)\" stroke-width=\"1.4\"/><circle cx=\"20\" cy=\"18\" r=\"8\" fill=\"var(--gn-skin1)\" stroke=\"var(--gn-line)\" stroke-width=\"1.6\"/><path d=\"M12 16 q4 -7 12 -6 q4 1 5 5 q-6 -3 -10 -1 q-4 1 -7 2z\" fill=\"#6b3a1f\" stroke=\"var(--gn-line)\" stroke-width=\"1.3\"/><circle cx=\"17\" cy=\"19\" r=\"1\" fill=\"var(--gn-line)\"/><circle cx=\"23\" cy=\"19\" r=\"1\" fill=\"var(--gn-line)\"/><path d=\"M17.5 23 q2.5 2 5 0\" fill=\"none\" stroke=\"var(--gn-line)\" stroke-width=\"1.2\" stroke-linecap=\"round\"/></g>"
];

/** The ring colour behind each seat's portrait. */
export const SEAT_COLOURS: readonly string[] = ['#355C99', '#C64E25', '#4A9471', '#D7A329', '#AC7CEF', '#66CAD8'];

export function Portrait({ seat, size = 36 }: { seat: number; size?: number }) {
  const face = FACES[seat % FACES.length]!;
  return (
    <span
      className={styles.portrait}
      style={{ width: size, height: size, background: SEAT_COLOURS[seat % SEAT_COLOURS.length] }}
      aria-hidden
    >
      <svg viewBox="0 0 40 40">
        {/* the heads are drawn around (20, 17); enlarge them to fill the ring */}
        <g transform="translate(20 20) scale(1.25) translate(-20 -17)" dangerouslySetInnerHTML={{ __html: face }} />
      </svg>
    </span>
  );
}
