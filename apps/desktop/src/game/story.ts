import type { EngineEvent, Industry, Seat } from '@boomtown/engine';

export interface BonusLine {
  readonly seats: readonly Seat[];
  readonly tier: 'primary' | 'secondary' | 'tertiary';
  readonly amount: number;
}

export interface MergerStory {
  readonly placedTile: string;
  readonly corporations: readonly Industry[];
  readonly survivor: Industry | null;
  readonly defunct: readonly Industry[];
  readonly bonuses: readonly BonusLine[];
  readonly complete: boolean;
}

/** Pull the most recent merger out of the event log, in progress or finished. Null when there is none. */
export function latestMerger(log: readonly EngineEvent[]): MergerStory | null {
  let start = -1;
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i]!.type === 'merger-started') {
      start = i;
      break;
    }
  }
  if (start === -1) return null;

  const span = log.slice(start);
  const started = span[0] as Extract<EngineEvent, { type: 'merger-started' }>;
  let survivor: Industry | null = null;
  const defunct: Industry[] = [];
  const bonuses: BonusLine[] = [];
  let complete = false;

  for (const event of span) {
    if (event.type === 'survivor-chosen') survivor = event.survivor;
    else if (event.type === 'corporation-defunct') defunct.push(event.industry);
    else if (event.type === 'bonus-paid') {
      const byTier = new Map<BonusLine['tier'], Set<Seat>>();
      for (const payout of event.payouts) {
        if (payout.seat < 0) continue;
        (byTier.get(payout.tier) ?? byTier.set(payout.tier, new Set()).get(payout.tier)!).add(payout.seat);
      }
      for (const payout of event.payouts) {
        if (payout.seat < 0) continue;
        if (bonuses.some((line) => line.tier === payout.tier && line.amount === payout.amount)) continue;
        bonuses.push({
          tier: payout.tier,
          amount: payout.amount,
          seats: [...(byTier.get(payout.tier) ?? [])],
        });
      }
    } else if (event.type === 'merger-completed') {
      survivor = event.survivor;
      complete = true;
    }
  }

  return {
    placedTile: started.placedTile,
    corporations: started.corporations,
    survivor,
    defunct,
    bonuses,
    complete,
  };
}
