import { INDUSTRY_INFO, type TileId } from '@boomtown/engine';
import { useGameClient, useLocalActiveView } from '../client/GameClientProvider.js';
import { foundingOptions, tierOpening } from '../reference/priceReference.js';
import styles from './decisions.module.css';
import { copy, fill } from '../copy/copy.js';

const TIERS = [1, 2, 3] as const;

const money = (n: number): string => `$${n.toLocaleString()}`;

/**
 * After a founding placement: the founder picks which corporation to raise on
 * the new group. Uses the **local active view** — the founder is the active
 * seat, and `DecisionModal` only opens this when that seat is local, so `you`
 * is the seat that must issue the command (`useAnyView`'s `you` is any seat's
 * and would send `found-corporation` for the wrong player — `not-your-turn`).
 *
 * **The choice is really a choice between tiers** (#65), because the tier sets
 * the share price and the bonus ladder for the rest of the game. So the
 * candidates are laid out in three tier columns with the tier's opening price
 * and bonus stated once in its heading, rather than a flat stack repeating
 * both on every button in a muted run-on the founder has to read three times
 * to find the structure.
 *
 * Three things this has to keep right:
 *
 * **It is the reference chart's own layout.** `StockReference` already renders
 * three tier columns headed by tier number and its corporations, and it has an
 * artboard. Carrying that shape here means the modal looks like the chart the
 * player already learned, and the columns line up between the two places tiers
 * are discussed.
 *
 * **Tier is position and label, never colour.** `packages/engine/src/pool.ts`
 * records that the palette is deliberately *not* tier-aligned — a lightness
 * band per tier would put a tier's corporations at equal luminance and
 * re-create the failure the palette was rebuilt to fix. The colour on a button
 * is the corporation's own.
 *
 * **The columns hold their places.** Only unfounded corporations are listed,
 * so they start uneven (2 / 3 / 2) and thin out as the game goes on. A tier
 * with nothing left says so and keeps its column, because a modal that
 * reflowed between foundings would move the button under the pointer.
 */
export function FoundPrompt({ group }: { group: readonly TileId[] }) {
  const client = useGameClient();
  const view = useLocalActiveView();
  if (!view) return null;

  const found = copy.decisions.found;
  const options = foundingOptions(view);
  const hqTile = group[0]!;

  return (
    <div>
      <h2>{found.title}</h2>
      <p className={styles.seat}>
        {fill(found.seat, {
          name: view.seats[view.you]?.name ?? fill(copy.common.seatFallback, { n: view.you }),
          n: group.length,
        })}
      </p>

      <div className={styles.foundTiers}>
        {TIERS.map((tier) => {
          const opening = tierOpening(view, tier);
          const inTier = options.filter((option) => option.tier === tier);
          const label = fill(copy.reference.stock.tier, { n: tier });
          // `group`, not the landmark a named <section> would become: it is a
          // set of related controls inside a dialog, not a region of the page.
          return (
            <section key={tier} role="group" className={styles.foundTier} aria-label={label}>
              <h3 className={styles.foundTierName}>{label}</h3>
              <p className={`tabnum ${styles.foundTierTerms}`}>
                {fill(found.terms, {
                  price: money(opening.price),
                  bonus: money(opening.primary),
                })}
              </p>

              {inTier.length === 0 ? (
                <p className={styles.foundEmpty}>{found.allFounded}</p>
              ) : (
                inTier.map((option) => (
                  <button
                    key={option.industry}
                    type="button"
                    className={styles.foundOption}
                    style={{ borderColor: INDUSTRY_INFO[option.industry].color }}
                    onClick={() =>
                      client.dispatch({
                        type: 'found-corporation',
                        seat: view.you,
                        industry: option.industry,
                        hqTile,
                      })
                    }
                  >
                    {option.name}
                  </button>
                ))
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
