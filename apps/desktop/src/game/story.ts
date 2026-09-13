import type { EngineEvent, Industry, PlayerView, Seat } from '@boomtown/engine';

/** The corporation a log line is "about", so headline events can be tinted its colour. */
export function eventIndustry(event: EngineEvent): Industry | null {
  switch (event.type) {
    case 'corporation-founded':
    case 'corporation-grew':
    case 'corporation-defunct':
      return event.industry;
    case 'survivor-chosen':
    case 'merger-completed':
      return event.survivor;
    case 'bonus-paid':
      return event.defunct;
    default:
      return null;
  }
}

/** Whether a log line is a headline (a founding, a merger step) rather than routine. */
export function isHeadline(event: EngineEvent): boolean {
  return (
    event.type === 'corporation-founded' ||
    event.type === 'merger-started' ||
    event.type === 'survivor-chosen' ||
    event.type === 'corporation-defunct' ||
    event.type === 'merger-completed' ||
    event.type === 'end-announced' ||
    event.type === 'game-over'
  );
}

/**
 * The design's merger sentence: what the placed tile does, then the size
 * comparison that decides the survivor. Returns the two halves so the tile id
 * can be emphasised in the middle.
 */
export function mergerProse(
  merger: MergerStory,
  view: PlayerView,
): { readonly lead: string; readonly tile: string; readonly rest: string } | null {
  // Only while unresolved: once complete, the survivor has already absorbed the
  // defunct chains and view.corporations no longer holds the pre-merger sizes.
  if (merger.complete || !merger.survivor) return null;
  // corporation-defunct events only land at completion; mid-merger the defunct
  // chains are every corporation in the merger except the chosen survivor.
  const defunctIndustries = merger.corporations.filter((industry) => industry !== merger.survivor);
  if (defunctIndustries.length === 0) return null;
  const survivor = view.corporations[merger.survivor];
  const defunct = defunctIndustries.map((industry) => view.corporations[industry]);
  const smallest = defunct.reduce((a, b) => (b.size < a.size ? b : a));
  const eaten = defunct.map((corp) => corp.baseName);
  const eatenList =
    eaten.length === 1 ? eaten[0] : `${eaten.slice(0, -1).join(', ')} and ${eaten.at(-1)}`;
  return {
    lead: `Placing `,
    tile: merger.placedTile,
    rest:
      ` folds ${eatenList} into ${survivor.baseName}. ` +
      `${survivor.baseName} is larger at ${survivor.size} tiles, ` +
      `so ${smallest.baseName} is dissolved at ${smallest.size}.`,
  };
}

export interface BonusLine {
  readonly seats: readonly Seat[];
  readonly tier: 'primary' | 'secondary' | 'tertiary';
  readonly amount: number;
}

/**
 * The word a table actually uses for a bonus tier. The engine's tiers are
 * always `primary | secondary | tertiary`, but the *classic* ruleset pays only
 * two bonuses and labels them `primary` and `tertiary` internally — skipping
 * `secondary` entirely — so the raw tier is never the word to show. There
 * "primary" reads as majority and anything below it as minority, matching the
 * stock-reference chart; the 2015 edition uses all three words as they are.
 *
 * Lives here, beside `BonusLine`, because both the story panel and the merger
 * beat display the same payouts and must agree on what to call them.
 */
export function tierWord(tier: BonusLine['tier'], bonusTiers: 2 | 3): string {
  if (bonusTiers === 3) return tier;
  return tier === 'primary' ? 'majority' : 'minority';
}

/**
 * One absorption: a defunct corporation and the bonuses paid on it.
 *
 * A merger of three or more corporations resolves its chains **one at a time,
 * largest first, each finished before the next begins** — that sequencing is
 * the load-bearing part of the rules. The story has to keep the same shape, or
 * nothing downstream can show it: before this existed the payouts from every
 * chain were flattened into one list and deduped by `(tier, amount)`, so two
 * equal-sized chains paying the same amounts collapsed into one and a seat that
 * had been paid vanished from the merger's own climax.
 */
export interface AbsorbedChain {
  readonly defunct: Industry;
  readonly bonuses: readonly BonusLine[];
  /** False while this chain is mid-disposal — the merger is still running. */
  readonly resolved: boolean;
}

export interface MergerStory {
  readonly placedTile: string;
  readonly corporations: readonly Industry[];
  readonly survivor: Industry | null;
  readonly defunct: readonly Industry[];
  /** Every absorption, in the order the engine resolved them. */
  readonly chains: readonly AbsorbedChain[];
  /** Every bonus line across every chain, flattened. Prefer `chains` where the
   *  chain matters — this is for callers that only need a total. */
  readonly bonuses: readonly BonusLine[];
  readonly complete: boolean;
}

/**
 * The bonus lines for **one** `bonus-paid` event.
 *
 * The dedupe is per event and deliberate: a tie splits a tier across several
 * payouts of the same amount, which is one line naming both seats. Running that
 * dedupe across the whole merger was the bug — it silently dropped a second
 * chain that happened to pay the same.
 */
function linesFor(payouts: Extract<EngineEvent, { type: 'bonus-paid' }>['payouts']): BonusLine[] {
  const byTier = new Map<BonusLine['tier'], Set<Seat>>();
  for (const payout of payouts) {
    if (payout.seat < 0) continue;
    (byTier.get(payout.tier) ?? byTier.set(payout.tier, new Set()).get(payout.tier)!).add(payout.seat);
  }
  const lines: BonusLine[] = [];
  for (const payout of payouts) {
    if (payout.seat < 0) continue;
    if (lines.some((line) => line.tier === payout.tier && line.amount === payout.amount)) continue;
    lines.push({
      tier: payout.tier,
      amount: payout.amount,
      seats: [...(byTier.get(payout.tier) ?? [])],
    });
  }
  return lines;
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
  const chains: AbsorbedChain[] = [];
  let complete = false;

  for (const event of span) {
    if (event.type === 'survivor-chosen') survivor = event.survivor;
    else if (event.type === 'bonus-paid') {
      // Opens a chain. `bonus-paid` always precedes the `corporation-defunct`
      // that closes it, because the engine pays before it disposes.
      chains.push({ defunct: event.defunct, bonuses: linesFor(event.payouts), resolved: false });
    } else if (event.type === 'corporation-defunct') {
      const open = chains.findIndex((c) => c.defunct === event.industry && !c.resolved);
      if (open >= 0) chains[open] = { ...chains[open]!, resolved: true };
      else chains.push({ defunct: event.industry, bonuses: [], resolved: true });
    } else if (event.type === 'merger-completed') {
      survivor = event.survivor;
      complete = true;
    }
  }

  const defunct = chains.map((c) => c.defunct);
  const bonuses = chains.flatMap((c) => c.bonuses);

  return {
    placedTile: started.placedTile,
    corporations: started.corporations,
    survivor,
    defunct,
    chains,
    bonuses,
    complete,
  };
}
