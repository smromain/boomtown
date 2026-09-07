import * as Dialog from '@radix-ui/react-dialog';
import { useAnyView } from '../client/GameClientProvider.js';
import { editionLabel } from '../setup/editionLabel.js';
import { corpsByTier, fullChart } from './priceReference.js';
import styles from './reference.module.css';

/**
 * The full stock-reference chart (the "stock reference" modal). The whole table
 * is generated from the ruleset — the 2015 preset renders different bands and a
 * secondary bonus column from the same component — and each founded corporation
 * is marked on the row it currently sits.
 */
export function StockReference({ open, onClose }: { open: boolean; onClose: () => void }) {
  const view = useAnyView();
  if (!view) return null;

  const rows = fullChart(view);
  const byTier = corpsByTier(view);
  const threeCols = view.ruleset.bonusTiers === 3;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.chart} aria-describedby={undefined}>
          <header className={styles.head}>
            <div>
              <Dialog.Title className="serif">Stock reference</Dialog.Title>
              <p className={styles.sub}>
                {editionLabel(view.ruleset.id)} rule set · price and bonuses by corporation size ·
                highlighted rows are where the market stands now
              </p>
            </div>
            <div className={styles.headRight}>
              <span className={styles.safeNote}>safe at {view.ruleset.safeSize} tiles</span>
              <Dialog.Close className={styles.close} aria-label="Close">
                ✕
              </Dialog.Close>
            </div>
          </header>

          <div className={styles.tableWrap}>
            <table className={styles.table} data-three={threeCols}>
              <thead>
                <tr>
                  {([1, 2, 3] as const).map((tier) => (
                    <th key={tier} className={styles.tierHead}>
                      <span className={styles.tierLabel}>Tier {tier}</span>
                      <span className={styles.tierCorps}>
                        {byTier[tier].map((c) => (
                          <span
                            key={c.industry}
                            style={{ color: c.size > 0 ? c.color : undefined }}
                            className={c.size > 0 ? undefined : styles.dim}
                          >
                            {c.name}
                          </span>
                        ))}
                      </span>
                    </th>
                  ))}
                  <th className={styles.money}>Share</th>
                  <th className={styles.money}>{threeCols ? 'Primary' : 'Majority'}</th>
                  {threeCols && <th className={styles.money}>Secondary</th>}
                  <th className={styles.money}>{threeCols ? 'Tertiary' : 'Minority'}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const live = r.tiers.some((t) => t.here.length > 0);
                  return (
                    <tr key={r.row} data-live={live}>
                      {r.tiers.map((t) => (
                        <td key={t.tier} className={styles.bandCell}>
                          <span className={styles.band}>{t.label}</span>
                          {t.here.map((m) => (
                            <span
                              key={m.industry}
                              className={styles.chip}
                              style={{ background: m.color }}
                            >
                              {m.name} <span className="tabnum">{m.size}</span>
                            </span>
                          ))}
                        </td>
                      ))}
                      <td className={`${styles.money} tabnum ${styles.price}`}>
                        ${r.price.toLocaleString()}
                      </td>
                      <td className={`${styles.money} tabnum`}>${r.primary.toLocaleString()}</td>
                      {threeCols && (
                        <td className={`${styles.money} tabnum`}>
                          {r.secondary != null ? `$${r.secondary.toLocaleString()}` : '—'}
                        </td>
                      )}
                      <td className={`${styles.money} tabnum ${styles.dim}`}>
                        ${r.tertiary.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <footer className={styles.foot}>
            {threeCols
              ? 'Primary is ten times the share price; secondary and tertiary are the printed lookup. '
              : 'Majority is always ten times the share price and minority five times. '}
            A merged corporation prices on the <strong>survivor’s</strong> tier — whatever it swallows.
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
