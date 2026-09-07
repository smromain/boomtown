import { useState } from 'react';
import { INDUSTRY_INFO, type TileId } from '@boomtown/engine';
import { useGameClient, useLocalActiveView } from '../client/GameClientProvider.js';
import { foundingOptions } from '../reference/priceReference.js';
import styles from './decisions.module.css';

/**
 * After a founding placement: the founder picks which corporation to raise on
 * the new group. Uses the **local active view** — the founder is the active
 * seat, and `DecisionModal` only opens this when that seat is local, so `you`
 * is the seat that must issue the command (`useAnyView`'s `you` is any seat's
 * and would send `found-corporation` for the wrong player — `not-your-turn`).
 *
 * A "Show tier & price" toggle expands the opening share price and bonus for
 * each option so the founder can judge which is worth the most, without
 * leaving the modal for the reference chart.
 */
export function FoundPrompt({ group }: { group: readonly TileId[] }) {
  const client = useGameClient();
  const view = useLocalActiveView();
  const [showRef, setShowRef] = useState(false);
  if (!view) return null;

  const options = foundingOptions(view); // unfounded only, richest tier first
  const hqTile = group[0]!;

  return (
    <div>
      <h2>Found a corporation</h2>
      <p className={styles.seat}>
        {view.seats[view.you]?.name ?? `Seat ${view.you}`} · new group of {group.length} tiles
      </p>

      <button
        type="button"
        className={styles.refToggle}
        aria-expanded={showRef}
        onClick={() => setShowRef((v) => !v)}
      >
        {showRef ? 'Hide' : 'Show'} tier &amp; opening value
      </button>

      <div className={styles.options}>
        {options.map((option) => (
          <button
            key={option.industry}
            type="button"
            className={styles.option}
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
            <span className={styles.optionName}>{option.name}</span>
            {showRef && (
              <span className={styles.optionRef}>
                tier {option.tier} · ${option.openingPrice.toLocaleString()}/share ·{' '}
                bonus from ${option.openingPrimary.toLocaleString()}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
