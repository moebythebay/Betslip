export type FinancialBet = {
  stake: number;
  actualReturn: number | null;
  decimalOdds: number;
  status: string;
};

export type BetSettlementDraft = {
  status: string;
  actualReturn?: number | null;
  legs: Array<{ status?: string | null }>;
};

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateNetProfit(bet: FinancialBet): number {
  return roundMoney((bet.actualReturn ?? 0) - bet.stake);
}

export function validateSettlement(
  draft: BetSettlementDraft,
): string | undefined {
  if (draft.status === "pending" && draft.actualReturn != null) {
    return "A pending bet cannot have a settled return.";
  }
  if (draft.status !== "pending" && draft.actualReturn == null) {
    return "Enter the bookmaker's actual return before settling a bet.";
  }
  if (
    draft.status !== "pending" &&
    draft.legs.some((leg) => !leg.status || leg.status === "pending")
  ) {
    return "Set the result of every leg before settling the full bet.";
  }
  return undefined;
}

export function summarizeBets(bets: FinancialBet[]) {
  const settled = bets.filter((bet) => bet.status !== "pending");
  const settledStake = settled.reduce((sum, bet) => sum + bet.stake, 0);
  const totalReturns = settled.reduce(
    (sum, bet) => sum + (bet.actualReturn ?? 0),
    0,
  );
  const netProfit = totalReturns - settledStake;
  const winCount = settled.filter((bet) => bet.status === "won").length;
  const averageOdds =
    settled.length === 0
      ? 0
      : settled.reduce((sum, bet) => sum + bet.decimalOdds, 0) / settled.length;

  return {
    totalBets: bets.length,
    settledBets: settled.length,
    pendingBets: bets.length - settled.length,
    totalStaked: roundMoney(bets.reduce((sum, bet) => sum + bet.stake, 0)),
    settledStake: roundMoney(settledStake),
    totalReturns: roundMoney(totalReturns),
    netProfit: roundMoney(netProfit),
    roi: settledStake === 0 ? 0 : roundMoney((netProfit / settledStake) * 100),
    winRate:
      settled.length === 0 ? 0 : roundMoney((winCount / settled.length) * 100),
    averageOdds: roundMoney(averageOdds),
  };
}
