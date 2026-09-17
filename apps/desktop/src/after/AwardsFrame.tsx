import { INDUSTRY_INFO, type Award, type AwardId, type CorpView, type Industry } from '@boomtown/engine';
import styles from './after.module.css';
import { copy, fill } from '../copy/copy.js';

export const AWARDS_PER_PAGE = 5;

/**
 * Awards whose number is money rather than a count. The engine hands back a
 * plain number for all of them — it has no opinion about how anything reads —
 * so the formatting decision lives here, beside the other presentation.
 */
const MONEY: ReadonlySet<AwardId> = new Set<AwardId>([
  'right-place-right-collapse',
  'professional-mourner',
  'fire-sale-enthusiast',
  'money-was-no-object',
  'cash-is-a-position',
]);

const ORDINALS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth'];

const items = copy.game.after.awards.items as Record<string, { title: string; sub: string; stat: string }>;

/**
 * Frame four: the superlatives (#69), five at a time.
 *
 * Every earned award is shown rather than a chosen three, because choosing
 * means ranking "interesting" and that is a design problem with no good
 * answer. Paging the whole set means the table sees all of them and nobody has
 * to decide — and an award nobody earned never reaches here at all, because
 * the engine does not emit one.
 *
 * The tint is the corporation an award is genuinely *about* — the one that
 * died, the one that was built — and neutral otherwise. Never the seat's:
 * seats have no colour on this screen, which is the finding the whole
 * after-game design turns on.
 */
export function AwardsFrame({
  awards,
  page,
  pages,
  names,
  corporations,
}: {
  awards: readonly Award[];
  page: number;
  pages: number;
  names: readonly string[];
  corporations: Record<Industry, CorpView> | undefined;
}) {
  const after = copy.game.after.awards;
  const slice = awards.slice(page * AWARDS_PER_PAGE, page * AWARDS_PER_PAGE + AWARDS_PER_PAGE);

  if (awards.length === 0) {
    return (
      <div className={styles.empty}>
        <span>{after.none}</span>
      </div>
    );
  }

  return (
    <>
      <div className={styles.awardList}>
        {slice.map((award) => {
          const words = items[award.id];
          if (!words) return null;
          const tint = award.industry ? INDUSTRY_INFO[award.industry].color : 'var(--rule)';
          const company = award.industry
            ? (corporations?.[award.industry]?.displayName ?? corporations?.[award.industry]?.baseName ?? '')
            : '';
          const value = MONEY.has(award.id) ? `$${award.value.toLocaleString()}` : String(award.value);
          const stat = fill(words.stat, {
            value: award.id === 'strictly-a-passenger' ? (ORDINALS[award.value] ?? String(award.value)) : value,
            of: award.of ?? 0,
            company,
          });
          return (
            <div key={award.id} className={styles.award}>
              <span className={styles.awardBar} style={{ background: tint }} />
              <span className={`serif ${styles.awardTitle}`}>{words.title}</span>
              <span className={styles.awardSub}>{words.sub}</span>
              <span className={styles.awardWho}>
                <span className={styles.awardSeat}>
                  {award.seats.map((seat) => names[seat] ?? '').join(' · ')}
                </span>
                <span className={`tabnum ${styles.awardStat}`}>{stat}</span>
              </span>
            </div>
          );
        })}
      </div>

      <div className={styles.counter}>
        <span className={styles.dots} aria-hidden="true">
          {Array.from({ length: pages }, (_, index) => (
            <span key={index} className={styles.dot} data-live={index === page} />
          ))}
        </span>
        <span>{fill(after.counter, { n: page + 1, total: pages })}</span>
      </div>
    </>
  );
}
