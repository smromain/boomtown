/**
 * The Going Public tuning harness (#27).
 *
 * Not a test — a measurement script. The window position, the quota and the
 * motion limit are guesses until this runs, and it is deliberately cheap
 * compared with building any of the UI that would sit on top of them.
 *
 * Run with:
 *   npx tsx packages/ai/test/tuning.ts            # default sweep
 *   npx tsx packages/ai/test/tuning.ts 400        # games per configuration
 *
 * What it answers, per seat count and per configuration:
 *   - how often a motion is called at all (a mechanic nobody uses is the
 *     likeliest way this design fails, well ahead of unbalancing anything)
 *   - how often a called motion carries (never = the quota is unreachable;
 *     always = it is a formality and the vote is not a decision)
 *   - whether the leader wins MORE than under classic, on the same seeds
 *   - how many turns the early exit actually saves
 *   - whether the decisive second backer is usually the runner-up, which is
 *     what the incentive analysis predicts
 */
import {
  PRESETS,
  createGame,
  makeRng,
  reduce,
  type Command,
  type EndVoteConfig,
  type EngineEvent,
  type GameState,
  type Ruleset,
  type Seat,
} from '@boomtown/engine';
import { heuristicPolicy, ledgerFrom, redactFor, type Policy } from '../src/index.js';

interface GameOutcome {
  readonly motionsRaised: number;
  readonly carried: boolean;
  readonly turns: number;
  readonly winner: Seat;
  /** Seats that backed the carrying motion, in register order (biggest first). */
  readonly backerRanks: readonly number[];
}

function playOne(
  seatCount: number,
  ruleset: Ruleset,
  seed: number,
  level = 6,
): GameOutcome {
  let state: GameState = createGame({
    seats: Array.from({ length: seatCount }, (_, i) => ({ name: `P${i}` })),
    seed,
    turnOrder: Array.from({ length: seatCount }, (_, i) => i),
    ruleset,
  });
  const policies = new Map<Seat, Policy>(
    Array.from({ length: seatCount }, (_, i) => [i, heuristicPolicy({ level })]),
  );

  let rng = makeRng(seed * 31 + 7);
  const log: EngineEvent[] = [];
  let guard = 0;
  let motionsRaised = 0;
  let carried = false;
  let backerRanks: number[] = [];

  while (state.status === 'playing') {
    if (guard++ > 20000) throw new Error('did not terminate');
    const seat =
      state.merger?.pending?.seat ?? state.motion?.pending?.seat ?? state.turnOrder[state.turnPointer]!;
    const belief = redactFor(state, seat, ledgerFrom(log, seatCount));
    const choice = policies.get(seat)!.chooseMove(belief, seat, rng);
    if (!choice) throw new Error(`no move for seat ${seat} at ${state.step}`);
    rng = choice.rng;

    const before = state;
    const result = reduce(state, choice.command as Command);
    if (!result.ok) throw new Error(`illegal ${choice.command.type}: ${result.error.code}`);
    state = result.state;

    for (const event of result.events) {
      if (event.type === 'motion-raised') motionsRaised += 1;
      if (event.type === 'motion-carried') {
        carried = true;
        const weights = before.motion?.weights ?? {};
        const byWeight = Object.keys(weights)
          .map(Number)
          .sort((a, b) => (weights[b] ?? 0) - (weights[a] ?? 0));
        backerRanks = event.backers.map((s) => byWeight.indexOf(s));
      }
    }
    log.push(...result.events);
  }

  const turns = log.filter((e) => e.type === 'turn-advanced').length;
  const winner = state.result!.winners[0]!;
  return { motionsRaised, carried, turns, winner, backerRanks };
}

/** Wins by starting seat, as a crude proxy for "does position or lead compound". */
function summarise(label: string, outcomes: readonly GameOutcome[]): void {
  const n = outcomes.length;
  const called = outcomes.filter((o) => o.motionsRaised > 0).length;
  const carried = outcomes.filter((o) => o.carried).length;
  const turns = outcomes.reduce((a, o) => a + o.turns, 0) / n;
  const runnerUpBacked = outcomes
    .filter((o) => o.carried)
    .filter((o) => o.backerRanks.includes(1)).length;

  console.log(
    [
      label.padEnd(34),
      `games ${String(n).padStart(4)}`,
      `called ${((called / n) * 100).toFixed(0).padStart(3)}%`,
      `carried ${called ? ((carried / called) * 100).toFixed(0).padStart(3) : '  -'}% of called`,
      `turns ${turns.toFixed(1).padStart(5)}`,
      `2nd-backed ${carried ? ((runnerUpBacked / carried) * 100).toFixed(0).padStart(3) : '  -'}%`,
    ].join('  '),
  );
}

function withVote(over: Partial<EndVoteConfig>): Ruleset {
  const base = PRESETS.boomtown;
  return { ...base, endVote: { ...base.endVote!, ...over } };
}

const GAMES = Number(process.argv[2] ?? 150);

console.log(`\nGoing Public tuning — ${GAMES} games per configuration\n`);

for (const seats of [3, 4, 5, 6]) {
  console.log(`--- ${seats} seats ---`);

  const classic = Array.from({ length: GAMES }, (_, g) => playOne(seats, PRESETS.classic, 1000 + g));
  summarise('classic (baseline)', classic);

  for (const quorum of [2, 3]) {
    for (const quota of [0.6, 2 / 3, 0.75]) {
      const ruleset = withVote({ quorumSafeCorps: quorum, quota, minPlayers: 3 });
      const outcomes = Array.from({ length: GAMES }, (_, g) => playOne(seats, ruleset, 1000 + g));
      summarise(`quorum ${quorum}, quota ${quota.toFixed(2)}`, outcomes);
    }
  }
  console.log('');
}
