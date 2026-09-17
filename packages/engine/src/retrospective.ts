import type { Command } from './commands.js';
import type { EngineEvent } from './events.js';
import { INDUSTRIES, INDUSTRY_INFO, type Industry } from './pool.js';
import { sharePrice } from './pricing.js';
import { reduce } from './reducer/index.js';
import { awardsFrom, type Award, type AwardLedger, newAwardLedger, observeForAwards } from './awards.js';
import { corpSize, isFounded, type GameState, type Seat } from './state.js';

/** One seat at the end of one turn. */
export interface SeatTurn {
  readonly cash: number;
  readonly holdings: Readonly<Record<Industry, number>>;
  /**
   * Cash plus stock at that turn's price. Shares in a corporation that is not
   * on the board are worth nothing, which is the same arithmetic settlement
   * uses — a held defunct chain is a bet on a refounding, not an asset.
   */
  readonly netWorth: number;
}

/** One corporation at the end of one turn. `size` and `price` are 0 when it is not on the board. */
export interface CorpTurn {
  readonly live: boolean;
  readonly size: number;
  readonly price: number;
}

export interface TurnRecord {
  /** 0 is the deal; each completed turn adds one. The last record is settlement. */
  readonly turn: number;
  readonly seats: readonly SeatTurn[];
  readonly corps: Readonly<Record<Industry, CorpTurn>>;
}

export type CompanyEventKind = 'founded' | 'refounded' | 'folded';

/** A company's own history: when it came onto the board, came back, or was eaten. */
export interface CompanyEvent {
  readonly turn: number;
  readonly industry: Industry;
  readonly kind: CompanyEventKind;
  /** Set on `folded`: what absorbed it. */
  readonly into?: Industry;
}

export interface Retrospective {
  readonly turns: readonly TurnRecord[];
  readonly companies: readonly CompanyEvent[];
  readonly awards: readonly Award[];
  /**
   * False when the command log did not replay cleanly — the records are what
   * was rebuilt before it stopped. The screen degrades to the standings rather
   * than showing a series that is missing its end.
   */
  readonly complete: boolean;
}

/**
 * Who the bonuses would pay if this corporation settled now, by the rules'
 * own tie handling (`docs/rules.md`, *Bonus ties*): a tie for largest is a
 * real position — the two bonuses combine and halve — and the next holder
 * *down* is second, not the seat tied with the leader. Seats come back in
 * ascending order, so two replays of the same log rank them identically.
 */
export function holderRanks(shares: readonly number[]): { largest: Seat[]; second: Seat[] } {
  const levels = [...new Set(shares.filter((n) => n > 0))].sort((a, b) => b - a);
  const at = (level: number | undefined): Seat[] =>
    level === undefined ? [] : shares.flatMap((n, seat) => (n === level ? [seat] : []));
  return { largest: at(levels[0]), second: at(levels[1]) };
}

function stockValue(state: GameState, seat: Seat): number {
  let total = 0;
  for (const industry of INDUSTRIES) {
    if (!isFounded(state, industry)) continue;
    const price = sharePrice(corpSize(state, industry), INDUSTRY_INFO[industry].tier, state.ruleset) ?? 0;
    total += state.seats[seat]!.holdings[industry] * price;
  }
  return total;
}

function snapshot(state: GameState, turn: number): TurnRecord {
  const corps = {} as Record<Industry, CorpTurn>;
  for (const industry of INDUSTRIES) {
    const live = isFounded(state, industry);
    const size = live ? corpSize(state, industry) : 0;
    corps[industry] = {
      live,
      size,
      price: live ? (sharePrice(size, INDUSTRY_INFO[industry].tier, state.ruleset) ?? 0) : 0,
    };
  }
  return {
    turn,
    seats: state.seats.map((seat, index) => ({
      cash: seat.cash,
      holdings: { ...seat.holdings },
      netWorth: seat.cash + stockValue(state, index),
    })),
    corps,
  };
}

/**
 * The end-of-game record, rebuilt by replaying the command log (#68, #69).
 *
 * It is **a pure function of the log** rather than anything the reducer keeps:
 * the log is already the persistence substrate, replaying it re-derives this
 * exactly, and nothing new has to be stored or kept in sync. It is also why
 * this must be built where the authoritative log lives — the room, or the
 * local session — and never folded client-side out of the event stream, which
 * is redacted per reader and would hand a closed table a different history
 * each (#60).
 *
 * A log that will not replay does not throw: the record comes back `complete:
 * false` with whatever was rebuilt, and the screen shows the standings alone.
 */
export function retrospective(initial: GameState, commands: readonly Command[]): Retrospective {
  const turns: TurnRecord[] = [snapshot(initial, 0)];
  const companies: CompanyEvent[] = [];
  const everFounded = new Set<Industry>();
  for (const industry of INDUSTRIES) if (isFounded(initial, industry)) everFounded.add(industry);

  const ledger: AwardLedger = newAwardLedger(initial);
  let state = initial;
  let turn = 0;
  let complete = true;

  for (const command of commands) {
    const result = reduce(state, command);
    if (!result.ok) {
      complete = false;
      break;
    }
    observeForAwards(ledger, command, result.events);
    state = result.state;
    for (const event of result.events) note(event);
  }

  // The last turn never advances — it ends the game — so settlement is the
  // closing record. Its net worth is the settled total, bonuses included,
  // which is what the standings beside the graph print: the two must agree or
  // one of them is lying.
  if (state.status === 'over') {
    const record = snapshot(state, turn + 1);
    const totals = state.result?.rankings ?? [];
    turns.push({
      ...record,
      seats: record.seats.map((seat, index) => ({
        ...seat,
        netWorth: totals.find((row) => row.seat === index)?.total ?? seat.netWorth,
      })),
    });
  } else if (turns[turns.length - 1]!.turn !== turn) {
    turns.push(snapshot(state, turn));
  }

  return { turns, companies, awards: awardsFrom(ledger), complete };

  function note(event: EngineEvent): void {
    switch (event.type) {
      case 'corporation-founded':
        companies.push({
          turn,
          industry: event.industry,
          kind: everFounded.has(event.industry) ? 'refounded' : 'founded',
        });
        everFounded.add(event.industry);
        return;
      case 'corporation-defunct':
        companies.push({ turn, industry: event.industry, kind: 'folded', into: event.absorbedInto });
        return;
      case 'turn-advanced':
        // `turn-advanced` names the seat coming *on*, so the turn it closes is
        // the one being counted here, and the snapshot is taken after it.
        turn += 1;
        turns.push(snapshot(state, turn));
        return;
      default:
        return;
    }
  }
}
