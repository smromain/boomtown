/** Constants both editions agree on (`docs/rules.md`, "Constants"). */
export const RULES = {
  minPlayers: 2,
  maxPlayers: 6,
  startingCash: 6000,
  handSize: 6,
  corporationCount: 7,
  sharesPerCorporation: 25,
  maxStockPurchasesPerTurn: 3,
  founderBonusShares: 1,
} as const;

/** Total shares across all seven corporations. */
export const TOTAL_SHARES = RULES.corporationCount * RULES.sharesPerCorporation;
