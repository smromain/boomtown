import * as Dialog from '@radix-ui/react-dialog';
import type { Industry } from '@boomtown/engine';
import { activeView } from '@boomtown/client-core';
import { useGameState } from '../client/GameClientProvider.js';
import { IndustryMark } from '../game/marks.js';
import { corpReference } from './priceReference.js';
import styles from './reference.module.css';

const TIER_WORD = { primary: 'primary', secondary: 'secondary', tertiary: 'tertiary' } as const;

/**
 * The single-corporation stock reference — its own tier ladder with the current
 * row marked, and what every shareholder would collect if it went defunct now.
 * Opened by clicking a corporation card in the band.
 *
 * Reads the **active seat's** view (like the band that opens it), not
 * `useAnyView` — that returns the first seat's projection, so "You hold" and
 * the primary-holder row would always report seat 0's holdings regardless of
 * who is actually playing.
 */
export function CorpReference({
  industry,
  onClose,
  onOpenChart,
}: {
  industry: Industry | null;
  onClose: () => void;
  onOpenChart: () => void;
}) {
  const view = useGameState(activeView);
  const data = industry && view ? corpReference(view, industry) : null;

  return (
    <Dialog.Root open={data != null} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.corp} aria-describedby={undefined}>
          {data && (
            <>
              <header className={styles.corpHead}>
                <IndustryMark industry={data.industry} color={data.color} size={30} />
                <div className={styles.corpTitle}>
                  <Dialog.Title className="serif" style={{ color: data.color }}>
                    {data.name}
                  </Dialog.Title>
                  {data.flavour && <p className={styles.corpFlavour}>{data.flavour}</p>}
                </div>
                {data.safe && (
                  <span className={styles.safeTag} style={{ color: data.color }}>
                    ◇ safe
                  </span>
                )}
                <Dialog.Close className={styles.close} aria-label="Close">
                  ✕
                </Dialog.Close>
              </header>

              <div className={styles.stats}>
                <div>
                  <span className={styles.statLabel}>Size</span>
                  <span className={`serif tabnum ${styles.statValue}`}>
                    {data.founded ? `${data.size} tiles` : 'in the tray'}
                  </span>
                </div>
                <div>
                  <span className={styles.statLabel}>Share price</span>
                  <span className={`serif tabnum ${styles.statValue}`}>
                    {data.sharePrice != null ? `$${data.sharePrice.toLocaleString()}` : '—'}
                  </span>
                </div>
                <div>
                  <span className={styles.statLabel}>You hold</span>
                  <span className={`serif tabnum ${styles.statValue}`} style={{ color: data.color }}>
                    {data.you.shares}
                    {data.you.shares > 0 && ` — $${data.you.value.toLocaleString()}`}
                  </span>
                </div>
              </div>

              <div className={styles.ladderHead}>
                <span className={styles.tierLabel}>Tier {data.tier} ladder</span>
                {data.nextStep && (
                  <span className={styles.nextStep}>
                    next step at <span className="tabnum">{data.nextStep.atSize} tiles</span> →{' '}
                    <span className="tabnum" style={{ color: data.color }}>
                      ${data.nextStep.price.toLocaleString()}
                    </span>
                  </span>
                )}
              </div>

              <table className={styles.ladder}>
                <tbody>
                  {data.ladder.map((rung) => (
                    <tr key={rung.band} data-current={rung.current}>
                      <td className="tabnum">{rung.label} tiles</td>
                      <td className={`tabnum ${styles.money}`}>${rung.price.toLocaleString()}</td>
                      <td className={`tabnum ${styles.money} ${styles.dim}`}>
                        ${rung.bonus.primary.toLocaleString()}
                      </td>
                      {view?.ruleset.bonusTiers === 3 && (
                        <td className={`tabnum ${styles.money} ${styles.dim}`}>
                          {rung.bonus.secondary != null ? `$${rung.bonus.secondary.toLocaleString()}` : '—'}
                        </td>
                      )}
                      <td className={`tabnum ${styles.money} ${styles.dim}`}>
                        ${rung.bonus.tertiary.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <footer className={styles.corpFoot}>
                <div className={styles.statLabel}>If it paid out today</div>
                {data.payouts.length === 0 ? (
                  <p className={styles.corpFlavour}>Nobody holds {data.name} yet.</p>
                ) : (
                  data.payouts.map((p) => (
                    <div key={p.seat} className={styles.payoutRow}>
                      <span>
                        {p.name}
                        {p.tier && <span className={styles.dim}> · {TIER_WORD[p.tier]}</span>}
                      </span>
                      <span className="tabnum">
                        {p.shares} sh{p.amount > 0 && ` — $${p.amount.toLocaleString()}`}
                      </span>
                    </div>
                  ))
                )}
                <button type="button" className={styles.chartLink} onClick={onOpenChart}>
                  See the full chart
                </button>
              </footer>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
