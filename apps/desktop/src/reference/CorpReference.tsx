import * as Dialog from '@radix-ui/react-dialog';
import type { Industry } from '@boomtown/engine';
import { useOwnView } from '../client/ownView.js';
import { IndustryMark } from '../game/marks.js';
import { industryTheme } from '../game/industryTheme.js';
import { corpReference } from './priceReference.js';
import styles from './reference.module.css';
import { copy, fill } from '../copy/copy.js';

const c = copy.reference;

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
  const view = useOwnView();
  const data = industry && view ? corpReference(view, industry) : null;
  // Every tinted word here is type on paper, so it takes the legible shade
  // rather than the fill (#19). The mark leads the title, so none of it
  // leans on colour to say which corporation this is.
  const tint = industry ? industryTheme(industry).onPaper : undefined;

  return (
    <Dialog.Root open={data != null} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.corp} aria-describedby={undefined}>
          {data && (
            <>
              <header className={styles.corpHead}>
                <IndustryMark industry={data.industry} color={tint!} size={30} />
                <div className={styles.corpTitle}>
                  <Dialog.Title className="serif" style={{ color: tint }}>
                    {data.name}
                  </Dialog.Title>
                  {data.flavour && <p className={styles.corpFlavour}>{data.flavour}</p>}
                </div>
                {data.safe && (
                  <span className={styles.safeTag} style={{ color: tint }}>
                    ◇ safe
                  </span>
                )}
                <Dialog.Close className={styles.close} aria-label={c.close}>
                  ✕
                </Dialog.Close>
              </header>

              <div className={styles.stats}>
                <div>
                  <span className={styles.statLabel}>{c.corp.size}</span>
                  <span className={`serif tabnum ${styles.statValue}`}>
                    {data.founded ? `${data.size} tiles` : 'in the tray'}
                  </span>
                </div>
                <div>
                  <span className={styles.statLabel}>{c.corp.sharePrice}</span>
                  <span className={`serif tabnum ${styles.statValue}`}>
                    {data.sharePrice != null ? `$${data.sharePrice.toLocaleString()}` : '—'}
                  </span>
                </div>
                <div>
                  <span className={styles.statLabel}>{c.corp.youHold}</span>
                  <span className={`serif tabnum ${styles.statValue}`} style={{ color: tint }}>
                    {data.you.shares}
                    {data.you.shares > 0 && ` — $${data.you.value.toLocaleString()}`}
                  </span>
                </div>
              </div>

              <div className={styles.ladderHead}>
                <span className={styles.tierLabel}>{fill(c.corp.ladder, { n: data.tier })}</span>
                {data.nextStep && (
                  <span className={styles.nextStep}>
                    {c.corp.nextStep}{' '}
                    <span className="tabnum">
                      {fill(c.corp.tilesCell, { label: data.nextStep.atSize })}
                    </span>{' '}
                    →{' '}
                    <span className="tabnum" style={{ color: tint }}>
                      ${data.nextStep.price.toLocaleString()}
                    </span>
                  </span>
                )}
              </div>

              <table className={styles.ladder}>
                <tbody>
                  {data.ladder.map((rung) => (
                    <tr key={rung.band} data-current={rung.current}>
                      <td className="tabnum">{fill(c.corp.tilesCell, { label: rung.label })}</td>
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
                <div className={styles.statLabel}>{c.corp.payoutHeading}</div>
                {data.payouts.length === 0 ? (
                  <p className={styles.corpFlavour}>{fill(c.corp.nobodyHolds, { name: data.name })}</p>
                ) : (
                  data.payouts.map((p) => (
                    <div key={p.seat} className={styles.payoutRow}>
                      <span>
                        {p.name}
                        {p.tier && <span className={styles.dim}> · {TIER_WORD[p.tier]}</span>}
                      </span>
                      <span className="tabnum">
                        {p.amount > 0
                          ? fill(c.corp.sharesWithCash, {
                              n: p.shares,
                              amount: p.amount.toLocaleString(),
                            })
                          : fill(c.corp.shares, { n: p.shares })}
                      </span>
                    </div>
                  ))
                )}
                <button type="button" className={styles.chartLink} onClick={onOpenChart}>
                  {c.corp.fullChart}
                </button>
              </footer>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
