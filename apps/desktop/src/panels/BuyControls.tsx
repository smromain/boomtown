import { useEffect, useState } from 'react';
import { INDUSTRY_INFO, RULES, type Industry } from '@boomtown/engine';
import { useGameClient, useGameState, useLocalActiveView } from '../client/GameClientProvider.js';
import { IndustryMark } from '../game/marks.js';
import { Button } from '../ui/Button.js';
import {
  buyCost,
  buyTotal,
  buyableCorporations,
  canIncrement,
  rowStanding,
  type BuyPicks,
} from './buying.js';
import styles from '../decisions/decisions.module.css';
import { copy, fill } from '../copy/copy.js';

/**
 * Pick up to 3 shares across founded corporations; the + button disables past
 * the cash and bank caps.
 *
 * This is the surface a player meets every single turn, so it is built from the
 * same pieces as the rest of the table rather than as a form (#58): each row
 * carries the industry colour and the `IndustryMark` the band, the tray and the
 * board badges already use, so a row reads as *that company* and not as a label
 * for one. There is no artboard for this dialog in `design/build.py` — the corp
 * card is the nearest precedent, and the colour chip here is its cap band at
 * row scale.
 *
 * A picked row tints toward the corporation's own colour, because "how much of
 * what am I buying" should be answerable by looking rather than by reading four
 * numbers. Hidden information is unchanged: everything shown comes from
 * `useLocalActiveView`, which is the acting seat's own view.
 */
export function BuyControls() {
  const view = useLocalActiveView();
  const busy = useGameState((state) => state.inFlight != null);
  const client = useGameClient();
  const [picks, setPicks] = useState<BuyPicks>({});

  const turnKey = `${view?.you ?? ''}:${view?.step ?? ''}`;
  useEffect(() => {
    setPicks({});
  }, [turnKey]);

  if (!view || view.step !== 'buy') return null;

  const corps = buyableCorporations(view);
  const total = buyTotal(picks);
  const cost = buyCost(view, picks);
  const bump = (industry: Industry, delta: number) =>
    setPicks((current) => ({ ...current, [industry]: Math.max(0, (current[industry] ?? 0) + delta) }));

  const you = view.seats[view.you]?.name ?? fill(copy.common.seatFallback, { n: view.you });

  return (
    <div aria-label={copy.buy.label}>
      <h2 className={`serif ${styles.buyTitle}`}>{copy.buy.title}</h2>
      {/* The table's own statement of where you stand, not a form's subtitle:
          who is spending, what they have, and how much of the allowance is
          committed. */}
      <p className={styles.buyPurse}>
        <span className={styles.buyPurseWho}>{you}</span>
        <span className={`tabnum ${styles.buyPurseCash}`}>
          {fill(copy.buy.cashInHand, { cash: view.yourCash.toLocaleString() })}
        </span>
        <span className={`tabnum ${styles.buyPursePicked}`}>
          {fill(copy.buy.pickedOf, { n: total, max: RULES.maxStockPurchasesPerTurn })}
        </span>
      </p>

      {corps.length === 0 ? (
        <p className={styles.waiting}>{copy.buy.nothingFounded}</p>
      ) : (
        <div className={styles.buyList}>
          {corps.map((industry) => (
            <BuyRow
              key={industry}
              industry={industry}
              name={view.corporations[industry].displayName}
              price={view.corporations[industry].sharePrice ?? 0}
              inBank={view.corporations[industry].bankShares}
              held={RULES.sharesPerCorporation - view.corporations[industry].bankShares}
              qty={picks[industry] ?? 0}
              standing={rowStanding(view, industry)}
              canAdd={canIncrement(view, picks, industry)}
              onLess={() => bump(industry, -1)}
              onMore={() => bump(industry, 1)}
            />
          ))}
        </div>
      )}

      <Button
        variant="primary"
        className={styles.buyConfirm}
        disabled={busy}
        onClick={() => client.dispatch({ type: 'buy-shares', seat: view.you, picks })}
      >
        {total === 0
          ? copy.buy.buyNothing
          : fill(copy.buy.buyTotal, { n: total, cost: cost.toLocaleString() })}
      </Button>
    </div>
  );
}

function BuyRow({
  industry,
  name,
  price,
  inBank,
  held,
  qty,
  standing,
  canAdd,
  onLess,
  onMore,
}: {
  industry: Industry;
  name: string;
  price: number;
  inBank: number;
  held: number;
  qty: number;
  standing: ReturnType<typeof rowStanding>;
  canAdd: boolean;
  onLess: () => void;
  onMore: () => void;
}) {
  const { color, ink } = INDUSTRY_INFO[industry];
  const blocked = standing !== 'available';
  const classes = [styles.buyRow, qty > 0 && styles.buyRowPicked, blocked && styles.buyRowBlocked]
    .filter(Boolean)
    .join(' ');

  return (
    // The corporation's colour rides in as a custom property so the tint, the
    // rule and the chip are one decision rather than three inline styles.
    <div className={classes} style={{ ['--corp' as string]: color }}>
      <span className={styles.buyChip} style={{ color: ink }}>
        <IndustryMark industry={industry} color={ink} size={17} />
      </span>

      <span className={styles.buyName}>
        <span className="serif">{name}</span>
        <span className={`tabnum ${styles.buyFloat}`}>
          {blocked ? (
            <span className={styles.buyStanding}>
              {standing === 'sold-out' ? copy.buy.soldOut : copy.buy.tooDear}
            </span>
          ) : (
            fill(copy.buy.inBankHeld, { inBank, held })
          )}
        </span>
      </span>

      <span className={`serif tabnum ${styles.buyPrice}`}>${price.toLocaleString()}</span>

      {/* One control, not three adjacent buttons: the steppers and the readout
          share a frame, so the cluster reads as a dial on the row. */}
      <span className={styles.buyStepper}>
        <button
          type="button"
          className={styles.buyStep}
          aria-label={fill(copy.buy.oneFewer, { name })}
          disabled={qty === 0}
          onClick={onLess}
        >
          −
        </button>
        <output className={`tabnum ${styles.buyQty}`} aria-label={fill(copy.buy.sharesToBuy, { name })}>
          {qty}
        </output>
        <button
          type="button"
          className={styles.buyStep}
          aria-label={fill(copy.buy.oneMore, { name })}
          disabled={!canAdd}
          onClick={onMore}
        >
          +
        </button>
      </span>
    </div>
  );
}
