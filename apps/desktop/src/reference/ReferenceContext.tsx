import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Industry } from '@boomtown/engine';
import { StockReference } from './StockReference.js';
import { CorpReference } from './CorpReference.js';

interface ReferenceApi {
  /** Open the full stock-reference chart. */
  openChart: () => void;
  /** Open the single-corporation reference for one industry. */
  openCorp: (industry: Industry) => void;
}

const ReferenceContext = createContext<ReferenceApi | null>(null);

/** Wrap the play surface so the header button and the corporation cards can
 *  open the stock-reference modals. Mounts both modals; only one is open at a
 *  time. */
export function ReferenceProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<{ kind: 'chart' } | { kind: 'corp'; industry: Industry } | null>(null);

  const api = useMemo<ReferenceApi>(
    () => ({
      openChart: () => setOpen({ kind: 'chart' }),
      openCorp: (industry) => setOpen({ kind: 'corp', industry }),
    }),
    [],
  );

  const close = useCallback(() => setOpen(null), []);

  return (
    <ReferenceContext.Provider value={api}>
      {children}
      <StockReference open={open?.kind === 'chart'} onClose={close} />
      <CorpReference
        industry={open?.kind === 'corp' ? open.industry : null}
        onClose={close}
        onOpenChart={api.openChart}
      />
    </ReferenceContext.Provider>
  );
}

const NOOP: ReferenceApi = { openChart: () => {}, openCorp: () => {} };

/**
 * The reference-modal opener. Outside a `<ReferenceProvider>` (isolated panel
 * tests) it returns no-ops rather than throwing — the header button and the
 * corporation cards stay renderable without the feature wired up.
 */
export function useReference(): ReferenceApi {
  return useContext(ReferenceContext) ?? NOOP;
}
