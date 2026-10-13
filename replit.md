# BetSlip

BetSlip is a private NBA betting ledger for recording bets, reviewing results, and understanding betting performance.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server on the configured `PORT`
- `pnpm --filter @workspace/betslip run dev` — run the BetSlip web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-server run test` — run financial calculation tests
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/betslip` — React/Vite application and app theme
- `artifacts/api-server/src/routes` — authenticated bet and dashboard endpoints
- `lib/api-spec/openapi.yaml` — source of truth for API contracts
- `lib/db/src/schema/bets.ts` — PostgreSQL bet and leg schema

## Architecture decisions

- Clerk provides sign-in; API bet and analytics requests are scoped to the signed-in Clerk user.
- A multi is one parent bet with separately stored legs; bookmaker returns are recorded, not inferred by multiplying leg odds.
- Sports are stored as extensible text, while the initial UI and API accept NBA only.
- ROI uses net profit divided by settled stake; pending bets are excluded from settled performance.
- Player and market breakdowns use singles only, so combined-bet stake and returns are not incorrectly attributed to individual legs.

## Product

Users can record NBA singles, multis, and same-game multis; track leg outcomes; edit or remove entries; search and filter bet history; export CSV; and review settled performance. Screenshot extraction and automatic NBA settlement are not configured in this release.

## User preferences

The app's name is BetSlip.

## Gotchas

- After changing `lib/api-spec/openapi.yaml`, run API codegen before typechecking dependent packages.
- Bet settlement requires an actual bookmaker return and a result for every leg; pending bets do not contribute to ROI.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
