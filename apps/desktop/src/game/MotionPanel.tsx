import type { PlayerView, Seat } from '@boomtown/engine';
import { useAnyView } from '../client/GameClientProvider.js';
import { Panel } from '../ui/Panel.js';
import { tallyOf } from './motion.js';
import styles from './game.module.css';
import { copy, fill } from '../copy/copy.js';

const m = copy.game.motion;

/**
 * The register and the vote on it (#26) — Boomtown's only panel, and only ever
 * on the table once someone has moved to liquidate.
 *
 * It reads `useAnyView`, not the active seat's view, for the same reason the
 * waiting card does: this is public information by definition — publishing the
 * register is the price of raising a motion — and online a client holds a view
 * for its own seat only, so an `activeView` read would blank the panel for
 * exactly the seats watching someone else vote.
 *
 * The register outlives the motion. Once published it never un-publishes, so
 * the panel stays for the rest of the game with the weights alone: the voting
 * power on the table is a standing fact players are meant to plan against, not
 * a modal that closes.
 */
export function MotionPanel() {
  const view = useAnyView();
  if (!view || !view.registerPublic || !view.register) return null;

  const tally = tallyOf(view);
  const name = (seat: Seat) => view.seats[seat]?.name ?? fill(copy.common.playerFallback, { n: seat + 1 });
  const weights = view.register;
  const seats = Object.keys(weights).map(Number);

  return (
    <Panel as="section" frame="top-rule" className={styles.card} aria-label={m.label}>
      <div className={`serif ${styles.cardHeading}`}>
        {tally ? m.headingMotion : m.headingRegister}
      </div>

      {tally ? (
        <p className={styles.quiet}>
          {fill(m.moved, {
            name: name(tally.by),
            needed: tally.needed,
            total: tally.total,
            backers: tally.minBackers > 1 ? fill(m.movedBackers, { n: tally.minBackers }) : '',
          })}
        </p>
      ) : (
        <p className={styles.quiet}>{m.registerNote}</p>
      )}

      {tally && <QuotaBar view={view} />}

      {seats.map((seat) => {
        const vote = view.motion?.votes[seat];
        return (
          <div key={seat} className={styles.voteRow} data-waiting={tally?.waitingOn === seat}>
            <span className={styles.holderName}>{name(seat)}</span>
            <span className={styles.voteMark}>
              {!tally
                ? null
                : vote === true
                  ? m.for
                  : vote === false
                    ? m.against
                    : tally.waitingOn === seat
                      ? m.voting
                      : m.undecided}
            </span>
            {view.openBooks.includes(seat) && <span className={styles.voteOpen}>{m.openBooks}</span>}
            <span className={`tabnum ${styles.voteWeight}`}>{weights[seat] ?? 0}</span>
          </div>
        );
      })}
    </Panel>
  );
}

/**
 * The tally as one bar: votes in favour against the whole register, with the
 * quota drawn through it. Two numbers ("11 of 24, needs 16") do not answer
 * "is this close?" at a glance, and how close it is is the only thing anyone
 * at the table is actually asking.
 */
function QuotaBar({ view }: { view: PlayerView }) {
  const tally = tallyOf(view)!;
  const pct = (n: number) => (tally.total > 0 ? (n / tally.total) * 100 : 0);
  const carrying = tally.yes >= tally.needed && tally.backers.length >= tally.minBackers;

  return (
    <>
      <div
        className={styles.voteBar}
        role="progressbar"
        aria-valuenow={tally.yes}
        aria-valuemin={0}
        aria-valuemax={tally.total}
        aria-label={fill(m.barLabel, { yes: tally.yes, total: tally.total, needed: tally.needed })}
      >
        <span className={styles.voteBarFill} data-carrying={carrying} style={{ width: `${pct(tally.yes)}%` }} />
        <span className={styles.voteBarQuota} style={{ left: `${pct(tally.needed)}%` }} />
      </div>
      <p className={styles.quiet}>
        <span className="tabnum">{tally.yes}</span> {m.tally}
        <span className="tabnum">{tally.no}</span> {m.tallyAgainst}
        <span className="tabnum">{tally.undecided}</span> {m.tallyUndecided}
      </p>
    </>
  );
}
