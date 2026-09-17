import { displayName, type EatenRecord } from '@boomtown/engine';
import type { EngineEvent, Industry, PlayerView, Seat } from '@boomtown/engine';
import { copy, fill } from '../copy/copy.js';

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
 * The corporations this merger is swallowing, while it is still running.
 *
 * `corporation-defunct` events only land at completion, so mid-merger the
 * defunct chains are every corporation in the merger except the chosen
 * survivor. Empty once complete — by then the survivor has absorbed them and
 * `view.corporations` no longer holds the pre-merger sizes — and empty while
 * the survivor is still undecided.
 */
export function beingAbsorbed(merger: MergerStory): readonly Industry[] {
  if (merger.complete || !merger.survivor) return [];
  return merger.corporations.filter((industry) => industry !== merger.survivor);
}

/**
 * What a corporation in this merger is **called**, as against what its
 * headquarters marker is called.
 *
 * A corporation is identified everywhere a player reads about it by the name it
 * trades under — the accreted `displayName`, not the `baseName` it was founded
 * with. The two only agree until its first merger, which is why naming from
 * `baseName` looked right for a game and then started narrating a twice-merged
 * survivor under a name nobody at the table had seen since.
 *
 * Two cases need care, and both are about *when* the name is read:
 *
 * - **The survivor** is named as it stood going into this merger. Its live
 *   `displayName` is exactly that while the merger runs, but at completion the
 *   engine appends this merger's fragments to it — so once complete the name is
 *   rebuilt from the absorptions that came *before* these ones.
 * - **A defunct corporation** keeps its live `displayName` while the merger
 *   runs, and loses it at completion, when its entry resets so the headquarters
 *   can be refounded under its own name. From then on the only record of what
 *   it was called is the one the survivor kept, which is what we read.
 */
export function tradingNameIn(merger: MergerStory, view: PlayerView, industry: Industry): string {
  if (industry === merger.survivor) return survivorNameBefore(merger, view, 0);
  const corp = view.corporations[industry];
  // Absorbed and reset: the record the survivor kept is the only name left.
  if (!corp.founded) return nameAtAbsorption(merger, view, industry) ?? corp.baseName;
  return corp.displayName || corp.baseName;
}

/**
 * The name the survivor was trading under before absorption `k` of this merger
 * — `k = 0` being the name it brought into the merger.
 *
 * Which absorptions are already on the survivor's `eaten` list depends on where
 * the merger is: nothing of this merger is there until it completes, and then
 * all of it is, in resolution order. So the entries for absorptions this merger
 * has not recorded yet are read from the doomed corporations themselves, which
 * are still standing while it runs.
 */
export function survivorNameBefore(merger: MergerStory, view: PlayerView, k: number): string {
  if (!merger.survivor) return '';
  const corp = view.corporations[merger.survivor];
  const recorded = merger.complete ? merger.chains.length : 0;
  const before = corp.eaten.length - recorded;
  const record = (name: string): EatenRecord => ({ displayName: name, flavours: [] });
  const prior = corp.eaten.slice(0, before).map((entry) => record(entry.displayName));
  const here = merger.chains.slice(0, k).map((chain, i) => {
    const kept = corp.eaten[before + i];
    const live = view.corporations[chain.defunct];
    return record(kept?.displayName ?? live.displayName ?? live.baseName);
  });
  return displayName(corp.baseName, [...prior, ...here], view.ruleset.mergeNaming);
}

/** What this merger recorded a defunct corporation as being called, once it has resolved it. */
function nameAtAbsorption(merger: MergerStory, view: PlayerView, industry: Industry): string | null {
  if (!merger.survivor) return null;
  const kept = view.corporations[merger.survivor].eaten.find((entry) => entry.industry === industry);
  return kept?.displayName ?? null;
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
  const defunctIndustries = beingAbsorbed(merger);
  if (defunctIndustries.length === 0) return null;
  const survivor = view.corporations[merger.survivor];
  const defunct = defunctIndustries.map((industry) => view.corporations[industry]);
  const smallest = defunct.reduce((a, b) => (b.size < a.size ? b : a));
  const eaten = defunctIndustries.map((industry) => tradingNameIn(merger, view, industry));
  const smallestIndustry = defunctIndustries[defunct.indexOf(smallest)]!;
  const survivorName = tradingNameIn(merger, view, merger.survivor);
  const smallestName = tradingNameIn(merger, view, smallestIndustry);
  return {
    lead: copy.story.proseLead,
    tile: merger.placedTile,
    rest: fill(copy.story.proseRest, {
      eaten: listOf(eaten),
      survivor: survivorName,
      survivorSize: survivor.size,
      smallest: smallestName,
      smallestSize: smallest.size,
    }),
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
  if (bonusTiers === 3) return copy.story.tiers[tier];
  return tier === 'primary' ? copy.story.tiers.majority : copy.story.tiers.minority;
}

/** "A", "A and B", "A, B and C" — the one place the app joins a list of names,
 *  so the comma and the "and" are copy like everything else. */
export function listOf(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return items.slice(0, -1).join(copy.story.listJoin) + copy.story.listAnd + items.at(-1);
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

/**
 * The index of the newest `merger-started`, or -1. The client log is
 * append-only for the whole session, so this finds a merger from twenty turns
 * ago just as readily as the one happening now — which is `currentMerger`'s
 * whole reason for existing.
 */
function latestMergerStart(log: readonly EngineEvent[]): number {
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i]!.type === 'merger-started') return i;
  }
  return -1;
}

/**
 * The merger that still owns the table, or null once play has moved past it.
 *
 * A merger is over when it has completed *and* the turn it interrupted has
 * ended. It deliberately outlives `merger-completed` by the mergemaker's buy:
 * the bonus split is still being read aloud when the merger resolves, and
 * pulling the narration out from under the table at that moment is worse than
 * holding it one more beat. `turn-advanced` is the boundary (#59).
 *
 * A merger that ends the game never sees a `turn-advanced` and stays on screen,
 * which is right — there is no next turn to move on to.
 */
export function currentMerger(log: readonly EngineEvent[]): MergerStory | null {
  const start = latestMergerStart(log);
  if (start === -1) return null;
  let completed = false;
  for (let i = start; i < log.length; i++) {
    const type = log[i]!.type;
    if (type === 'merger-completed') completed = true;
    else if (completed && type === 'turn-advanced') return null;
  }
  return latestMerger(log);
}

/** Pull the most recent merger out of the event log, in progress or finished. Null when there is none. */
export function latestMerger(log: readonly EngineEvent[]): MergerStory | null {
  const start = latestMergerStart(log);
  if (start === -1) return null;

  const span = log.slice(start);
  const started = span[0] as Extract<EngineEvent, { type: 'merger-started' }>;
  let survivor: Industry | null = null;
  const chains: AbsorbedChain[] = [];
  let complete = false;

  for (const event of span) {
    if (event.type === 'survivor-chosen') survivor = event.survivor;
    else if (event.type === 'bonus-paid') {
      // The engine pays before it disposes, so this normally opens the chain.
      // Match on the industry rather than assuming the order, though: a chain
      // is one absorption whichever of its two events is seen first, and a
      // reader that assumed the order counted a single absorption twice.
      const existing = chains.findIndex((c) => c.defunct === event.defunct && c.bonuses.length === 0);
      const line = { defunct: event.defunct, bonuses: linesFor(event.payouts) };
      if (existing >= 0) chains[existing] = { ...chains[existing]!, ...line };
      else chains.push({ ...line, resolved: false });
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
