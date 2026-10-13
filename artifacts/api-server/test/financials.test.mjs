import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateNetProfit,
  summarizeBets,
  validateSettlement,
} from "../src/lib/financials.ts";

test("profit, ROI, and win rate use settled bets and exclude pending stake", () => {
  const summary = summarizeBets([
    { stake: 50, actualReturn: 95, decimalOdds: 1.9, status: "won" },
    { stake: 25, actualReturn: 0, decimalOdds: 2.2, status: "lost" },
    { stake: 100, actualReturn: null, decimalOdds: 1.8, status: "pending" },
  ]);

  assert.equal(summary.totalStaked, 175);
  assert.equal(summary.settledStake, 75);
  assert.equal(summary.totalReturns, 95);
  assert.equal(summary.netProfit, 20);
  assert.equal(summary.roi, 26.67);
  assert.equal(summary.winRate, 50);
  assert.equal(summary.averageOdds, 2.05);
  assert.equal(summary.pendingBets, 1);
});

test("multi-bet profit uses the saved bookmaker return rather than multiplying leg odds", () => {
  const sameGameMulti = {
    stake: 10,
    actualReturn: 43.5,
    decimalOdds: 5.7,
    status: "won",
    legs: [
      { odds: 1.8, status: "won" },
      { odds: 2.1, status: "won" },
    ],
  };

  assert.equal(calculateNetProfit(sameGameMulti), 33.5);
});

test("a partially void multi is valid when leg outcomes and actual return are recorded", () => {
  const partialVoid = {
    stake: 5,
    actualReturn: 18,
    decimalOdds: 4.2,
    status: "won",
    legs: [{ status: "won" }, { status: "void" }],
  };

  assert.equal(validateSettlement(partialVoid), undefined);
  assert.equal(calculateNetProfit(partialVoid), 13);
});

test("a settled bet cannot be saved with missing return or unresolved legs", () => {
  assert.match(
    validateSettlement({
      status: "won",
      actualReturn: null,
      legs: [{ status: "won" }],
    }),
    /actual return/,
  );
  assert.match(
    validateSettlement({
      status: "won",
      actualReturn: 20,
      legs: [{ status: "won" }, { status: "pending" }],
    }),
    /every leg/,
  );
});
