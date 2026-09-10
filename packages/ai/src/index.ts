// @boomtown/ai — non-LLM Boomtown bots: a Policy over the engine's legal moves
// and evaluator (KTD7). Difficulty is a single 1–10 dial.

export {
  type Policy,
  type HeuristicPolicyOptions,
  heuristicPolicy,
  botRng,
} from './policy.js';
export {
  type DifficultyKnobs,
  difficulty,
  normalizeDifficulty,
} from './difficulty.js';
export { scoreMove, bestScore, ownMoves } from './heuristic.js';
export {
  type Ledger,
  emptyLedger,
  ledgerFrom,
  estimateHoldings,
} from './ledger.js';
export { redactFor, beliefState } from './redact.js';
export { backsMotion, wouldWinBySettlingNow } from './vote.js';
