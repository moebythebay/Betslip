import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  type SQL,
} from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateBetBody,
  CreateBetResponse,
  DeleteBetParams,
  GetBetParams,
  GetBetResponse,
  ListBetsQueryParams,
  ListBetsResponse,
  UpdateBetBody,
  UpdateBetParams,
  UpdateBetResponse,
} from "@workspace/api-zod";
import {
  betLegsTable,
  betsTable,
  db,
  type Bet,
  type BetLeg,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { validateSettlement } from "../lib/financials";

const router: IRouter = Router();
router.use(requireAuth);

type BetDraft = ReturnType<typeof CreateBetBody.parse>;

function dateToString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function validateDraft(draft: BetDraft): string | undefined {
  if (draft.betType === "single" && draft.legs.length !== 1) {
    return "A single bet must have exactly one leg.";
  }
  if (draft.betType !== "single" && draft.legs.length < 2) {
    return "A multi bet must have at least two legs.";
  }
  return validateSettlement(draft);
}

function toApiBet(bet: Bet, legs: BetLeg[]) {
  return {
    id: bet.id,
    sport: bet.sport,
    betType: bet.betType,
    bookmaker: bet.bookmaker,
    betDate: bet.betDate,
    event: bet.event,
    stake: bet.stake,
    decimalOdds: bet.decimalOdds,
    potentialReturn: bet.potentialReturn,
    actualReturn: bet.actualReturn,
    status: bet.status,
    notes: bet.notes,
    createdAt: bet.createdAt,
    updatedAt: bet.updatedAt,
    legs: legs.map((leg) => ({
      id: leg.id,
      event: leg.event,
      player: leg.player,
      market: leg.market,
      line: leg.line,
      selection: leg.selection,
      odds: leg.odds,
      status: leg.status,
    })),
  };
}

async function getLegsByBetIds(betIds: string[]): Promise<BetLeg[]> {
  if (betIds.length === 0) {
    return [];
  }

  return db
    .select()
    .from(betLegsTable)
    .where(inArray(betLegsTable.betId, betIds))
    .orderBy(asc(betLegsTable.createdAt), asc(betLegsTable.id));
}

function attachLegs(bets: Bet[], legs: BetLeg[]) {
  const legsByBetId = new Map<string, BetLeg[]>();
  for (const leg of legs) {
    const current = legsByBetId.get(leg.betId) ?? [];
    current.push(leg);
    legsByBetId.set(leg.betId, current);
  }

  return bets.map((bet) => toApiBet(bet, legsByBetId.get(bet.id) ?? []));
}

function valuesFromDraft(draft: BetDraft) {
  return {
    sport: draft.sport,
    betType: draft.betType,
    bookmaker: draft.bookmaker.trim(),
    betDate: dateToString(draft.betDate),
    event: draft.event?.trim() || null,
    stake: draft.stake,
    decimalOdds: draft.decimalOdds,
    potentialReturn: draft.potentialReturn ?? null,
    actualReturn: draft.actualReturn ?? null,
    status: draft.status,
    notes: draft.notes?.trim() || null,
  };
}

function legValuesFromDraft(draft: BetDraft, betId: string) {
  return draft.legs.map((leg) => ({
    betId,
    event: leg.event.trim(),
    player: leg.player?.trim() || null,
    market: leg.market.trim(),
    line: leg.line ?? null,
    selection: leg.selection.trim(),
    odds: leg.odds ?? null,
    status: leg.status ?? (draft.legs.length === 1 ? draft.status : "pending"),
  }));
}

router.get("/", async (req, res): Promise<void> => {
  const parsed = ListBetsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const params = parsed.data;
  const conditions: SQL[] = [eq(betsTable.userId, res.locals.userId)];

  if (params.from) conditions.push(gte(betsTable.betDate, params.from));
  if (params.to) conditions.push(lte(betsTable.betDate, params.to));
  if (params.bookmaker) {
    conditions.push(ilike(betsTable.bookmaker, `%${params.bookmaker}%`));
  }
  if (params.betType) conditions.push(eq(betsTable.betType, params.betType));
  if (params.result) conditions.push(eq(betsTable.status, params.result));
  if (params.market) {
    conditions.push(
      inArray(
        betsTable.id,
        db
          .select({ betId: betLegsTable.betId })
          .from(betLegsTable)
          .where(ilike(betLegsTable.market, `%${params.market}%`)),
      ),
    );
  }
  if (params.search) {
    const match = `%${params.search}%`;
    conditions.push(
      or(
        ilike(betsTable.bookmaker, match),
        ilike(betsTable.event, match),
        inArray(
          betsTable.id,
          db
            .select({ betId: betLegsTable.betId })
            .from(betLegsTable)
            .where(
              or(
                ilike(betLegsTable.event, match),
                ilike(betLegsTable.player, match),
                ilike(betLegsTable.market, match),
                ilike(betLegsTable.selection, match),
              ),
            ),
        ),
      )!,
    );
  }

  const bets = await db
    .select()
    .from(betsTable)
    .where(and(...conditions))
    .orderBy(desc(betsTable.betDate), desc(betsTable.createdAt));
  const legs = await getLegsByBetIds(bets.map((bet) => bet.id));
  res.json(ListBetsResponse.parse(attachLegs(bets, legs)));
});

router.post("/", async (req, res): Promise<void> => {
  const parsed = CreateBetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const draft = parsed.data;
  const validationError = validateDraft(draft);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const created = await db.transaction(async (tx) => {
    const [bet] = await tx
      .insert(betsTable)
      .values({ ...valuesFromDraft(draft), userId: res.locals.userId })
      .returning();
    const legs = await tx
      .insert(betLegsTable)
      .values(legValuesFromDraft(draft, bet.id))
      .returning();
    return { bet, legs };
  });

  res.status(201).json(CreateBetResponse.parse(toApiBet(created.bet, created.legs)));
});

router.get("/:id", async (req, res): Promise<void> => {
  const params = GetBetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [bet] = await db
    .select()
    .from(betsTable)
    .where(
      and(eq(betsTable.id, params.data.id), eq(betsTable.userId, res.locals.userId)),
    );

  if (!bet) {
    res.status(404).json({ error: "Bet not found" });
    return;
  }

  const legs = await getLegsByBetIds([bet.id]);
  res.json(GetBetResponse.parse(toApiBet(bet, legs)));
});

router.patch("/:id", async (req, res): Promise<void> => {
  const params = UpdateBetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateBetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const draft = parsed.data;
  const validationError = validateDraft(draft);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const updated = await db.transaction(async (tx) => {
    const [bet] = await tx
      .update(betsTable)
      .set({ ...valuesFromDraft(draft), updatedAt: new Date() })
      .where(
        and(
          eq(betsTable.id, params.data.id),
          eq(betsTable.userId, res.locals.userId),
        ),
      )
      .returning();
    if (!bet) {
      return undefined;
    }

    await tx.delete(betLegsTable).where(eq(betLegsTable.betId, bet.id));
    const legs = await tx
      .insert(betLegsTable)
      .values(legValuesFromDraft(draft, bet.id))
      .returning();
    return { bet, legs };
  });

  if (!updated) {
    res.status(404).json({ error: "Bet not found" });
    return;
  }

  res.json(UpdateBetResponse.parse(toApiBet(updated.bet, updated.legs)));
});

router.delete("/:id", async (req, res): Promise<void> => {
  const params = DeleteBetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(betsTable)
    .where(
      and(eq(betsTable.id, params.data.id), eq(betsTable.userId, res.locals.userId)),
    )
    .returning({ id: betsTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Bet not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
