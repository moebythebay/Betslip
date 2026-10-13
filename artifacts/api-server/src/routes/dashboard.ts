import { and, eq, gte, inArray, lte, type SQL } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  GetDashboardBreakdownQueryParams,
  GetDashboardBreakdownResponse,
  GetDashboardPerformanceQueryParams,
  GetDashboardPerformanceResponse,
  GetDashboardSummaryQueryParams,
  GetDashboardSummaryResponse,
} from "@workspace/api-zod";
import {
  betLegsTable,
  betsTable,
  db,
  type Bet,
  type BetLeg,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { calculateNetProfit, summarizeBets } from "../lib/financials";

const router: IRouter = Router();
router.use(requireAuth);

type DateRange = { from?: string; to?: string };

function dateRangeConditions(userId: string, range: DateRange): SQL[] {
  const conditions: SQL[] = [eq(betsTable.userId, userId)];
  if (range.from) conditions.push(gte(betsTable.betDate, range.from));
  if (range.to) conditions.push(lte(betsTable.betDate, range.to));
  return conditions;
}

function isSettled(bet: Bet): boolean {
  return bet.status !== "pending";
}

async function getUserBets(userId: string, range: DateRange): Promise<Bet[]> {
  return db
    .select()
    .from(betsTable)
    .where(and(...dateRangeConditions(userId, range)));
}

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const parsed = GetDashboardSummaryQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const bets = await getUserBets(res.locals.userId, parsed.data);
  res.json(GetDashboardSummaryResponse.parse(summarizeBets(bets)));
});

router.get("/dashboard/performance", async (req, res): Promise<void> => {
  const parsed = GetDashboardPerformanceQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const settled = (await getUserBets(res.locals.userId, parsed.data))
    .filter(isSettled)
    .sort((left, right) => left.betDate.localeCompare(right.betDate));
  const daily = new Map<string, { netProfit: number; staked: number }>();

  for (const bet of settled) {
    const point = daily.get(bet.betDate) ?? { netProfit: 0, staked: 0 };
    point.netProfit += calculateNetProfit(bet);
    point.staked += bet.stake;
    daily.set(bet.betDate, point);
  }

  let cumulativeProfit = 0;
  const points = [...daily.entries()].map(([date, point]) => {
    cumulativeProfit += point.netProfit;
    return {
      date,
      netProfit: Math.round((point.netProfit + Number.EPSILON) * 100) / 100,
      cumulativeProfit:
        Math.round((cumulativeProfit + Number.EPSILON) * 100) / 100,
      staked: Math.round((point.staked + Number.EPSILON) * 100) / 100,
    };
  });

  res.json(GetDashboardPerformanceResponse.parse(points));
});

router.get("/dashboard/breakdown", async (req, res): Promise<void> => {
  const parsed = GetDashboardBreakdownQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { by, ...range } = parsed.data;
  const bets = (await getUserBets(res.locals.userId, range)).filter(isSettled);
  let legs: BetLeg[] = [];
  if (by === "player" || by === "market") {
    const singleBetIds = bets
      .filter((bet) => bet.betType === "single")
      .map((bet) => bet.id);
    if (singleBetIds.length > 0) {
      legs = await db
        .select()
        .from(betLegsTable)
        .where(inArray(betLegsTable.betId, singleBetIds));
    }
  }

  const legsByBet = new Map<string, BetLeg[]>();
  for (const leg of legs) {
    const current = legsByBet.get(leg.betId) ?? [];
    current.push(leg);
    legsByBet.set(leg.betId, current);
  }

  const groups = new Map<
    string,
    { bets: number; staked: number; returns: number; wins: number }
  >();

  for (const bet of bets) {
    let label: string;
    if (by === "bookmaker") {
      label = bet.bookmaker;
    } else if (by === "betType") {
      label =
        bet.betType === "same_game_multi"
          ? "Same-game multi"
          : bet.betType === "multi"
            ? "Multi"
            : "Single";
    } else {
      if (bet.betType !== "single") continue;
      const leg = legsByBet.get(bet.id)?.[0];
      if (!leg) continue;
      label = by === "player" ? leg.player ?? "No player specified" : leg.market;
    }

    const group = groups.get(label) ?? {
      bets: 0,
      staked: 0,
      returns: 0,
      wins: 0,
    };
    group.bets += 1;
    group.staked += bet.stake;
    group.returns += bet.actualReturn ?? 0;
    if (bet.status === "won") group.wins += 1;
    groups.set(label, group);
  }

  const breakdown = [...groups.entries()]
    .map(([label, group]) => {
      const profit = group.returns - group.staked;
      return {
        label,
        bets: group.bets,
        staked: Math.round((group.staked + Number.EPSILON) * 100) / 100,
        returns: Math.round((group.returns + Number.EPSILON) * 100) / 100,
        netProfit: Math.round((profit + Number.EPSILON) * 100) / 100,
        roi:
          group.staked === 0
            ? 0
            : Math.round(((profit / group.staked) * 100 + Number.EPSILON) * 100) /
              100,
        winRate:
          Math.round(((group.wins / group.bets) * 100 + Number.EPSILON) * 100) /
          100,
      };
    })
    .sort((left, right) => right.netProfit - left.netProfit);

  res.json(GetDashboardBreakdownResponse.parse(breakdown));
});

export default router;
