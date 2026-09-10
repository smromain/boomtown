import type { PlayerView, Seat } from '@boomtown/engine';
import { useAnyView } from '../client/GameClientProvider.js';
import { Panel } from '../ui/Panel.js';
import { tallyOf } from './motion.js';
import styles from './game.module.css';

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
  const name = (seat: Seat) => view.seats[seat]?.name ?? `Player ${seat + 1}`;
  const weights = view.register;
  const seats = Object.keys(weights).map(Number);

  return (
    <Panel as="section" frame="top-rule" className={styles.card} aria-label="The register">
      <div className={`serif ${styles.cardHeading}`}>
        {tally ? 'Motion to liquidate' : 'The register'}
      </div>

      {tally ? (
        <p className={styles.quiet}>
          {name(tally.by)} moved to wind the game up. {tally.needed} of {tally.total} shares carry it
          {tally.minBackers > 1 ? `, and at least ${tally.minBackers} players must back it` : ''}.
        </p>
      ) : (
        <p className={styles.quiet}>Shares held in safe corporations — one vote each.</p>
      )}

      {tally && <QuotaBar view={view} />}

      {seats.map((seat) => {
        const vote = view.motion?.votes[seat];
        return (
          <div key={seat} className={styles.voteRow} data-waiting={tally?.waitingOn === seat}>
            <span className={styles.holderName}>{name(seat)}</span>
            <span className={styles.voteMark}>
              {!tally ? null : vote === true ? 'for' : vote === false ? 'against' : tally.waitingOn === seat ? 'voting…' : '—'}
            </span>
            {view.openBooks.includes(seat) && <span className={styles.voteOpen}>open books</span>}
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
        aria-label={`${tally.yes} of ${tally.total} shares in favour, ${tally.needed} needed`}
      >
        <span className={styles.voteBarFill} data-carrying={carrying} style={{ width: `${pct(tally.yes)}%` }} />
        <span className={styles.voteBarQuota} style={{ left: `${pct(tally.needed)}%` }} />
      </div>
      <p className={styles.quiet}>
        <span className="tabnum">{tally.yes}</span> for, <span className="tabnum">{tally.no}</span> against,{' '}
        <span className="tabnum">{tally.undecided}</span> yet to vote.
      </p>
    </>
  );
}
