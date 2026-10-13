import {
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const betsTable = pgTable(
  "bets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    sport: varchar("sport", { length: 40 }).notNull().default("NBA"),
    betType: varchar("bet_type", { length: 40 }).notNull(),
    bookmaker: varchar("bookmaker", { length: 100 }).notNull(),
    betDate: date("bet_date", { mode: "string" }).notNull(),
    event: varchar("event", { length: 180 }),
    stake: numeric("stake", { precision: 12, scale: 2, mode: "number" }).notNull(),
    decimalOdds: numeric("decimal_odds", {
      precision: 10,
      scale: 4,
      mode: "number",
    }).notNull(),
    potentialReturn: numeric("potential_return", {
      precision: 12,
      scale: 2,
      mode: "number",
    }),
    actualReturn: numeric("actual_return", {
      precision: 12,
      scale: 2,
      mode: "number",
    }),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("bets_user_date_idx").on(table.userId, table.betDate),
    index("bets_user_status_idx").on(table.userId, table.status),
  ],
);

export const betLegsTable = pgTable(
  "bet_legs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    betId: uuid("bet_id")
      .notNull()
      .references(() => betsTable.id, { onDelete: "cascade" }),
    event: varchar("event", { length: 180 }).notNull(),
    player: varchar("player", { length: 120 }),
    market: varchar("market", { length: 120 }).notNull(),
    line: numeric("line", { precision: 10, scale: 2, mode: "number" }),
    selection: varchar("selection", { length: 180 }).notNull(),
    odds: numeric("odds", { precision: 10, scale: 4, mode: "number" }),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("bet_legs_bet_id_idx").on(table.betId),
    index("bet_legs_player_idx").on(table.player),
    index("bet_legs_market_idx").on(table.market),
  ],
);

export const insertBetSchema = createInsertSchema(betsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBetLegSchema = createInsertSchema(betLegsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertBet = z.infer<typeof insertBetSchema>;
export type Bet = typeof betsTable.$inferSelect;
export type InsertBetLeg = z.infer<typeof insertBetLegSchema>;
export type BetLeg = typeof betLegsTable.$inferSelect;
