/**
 * One 1–10 dial (KTD7) mapped to the knobs the policy actually reads. The dial
 * is the only thing the setup screen exposes; everything here is derived from it
 * so difficulty stays a single number end to end.
 *
 * - `lookahead` — plies of forward search. 0 is a pure one-ply greedy pick; the
 *   top levels look one move ahead (an opponent reply is not modelled yet — the
 *   search re-scores the position after the bot's own follow-up).
 * - `blunderRate` — probability the bot takes a uniformly random legal move
 *   instead of its best. This is the main strength lever: a weak bot is a strong
 *   bot that fumbles often, which keeps low difficulty from feeling broken.
 * - `backingMargin` — how far ahead a bot wants to be before backing a motion
 *   to liquidate (#26). Backing one that fails costs its books for the rest of
 *   the game, so a strong bot wants a real cushion and a weak one takes any
 *   nominal lead and walks into the exposure. At the table that reads as
 *   recklessness against judgement rather than as a difficulty number.
 *
 * Determinization / hidden-tile sampling (KTD7) is deliberately left at 0 for
 * the first cut; the plan allows a sample count of 0 (pure heuristic).
 */
export interface DifficultyKnobs {
  readonly lookahead: number;
  readonly blunderRate: number;
  readonly backingMargin: number;
}

/** Clamp to 1–10 and round — the UI slider already constrains this, defence in depth. */
export function normalizeDifficulty(level: number): number {
  if (!Number.isFinite(level)) return 5;
  return Math.max(1, Math.min(10, Math.round(level)));
}

export function difficulty(level: number): DifficultyKnobs {
  const dial = normalizeDifficulty(level);
  return {
    // 1–6 greedy; 7–8 look one ply; 9–10 two plies.
    lookahead: dial >= 9 ? 2 : dial >= 7 ? 1 : 0,
    // Linear ramp: dial 1 → 0.5, dial 10 → 0.
    blunderRate: ((10 - dial) / 9) * 0.5,
    // Dial 1 backs a bare lead; dial 10 wants to be a fifth clear.
    backingMargin: ((dial - 1) / 9) * 0.2,
  };
}
