# LiftLedgr — Gym Workout Tracker

A personal gym training journal built for a school assignment, one feature at a time.

## Run & Operate

- Use the managed API and Gym Workout Tracker workflows to run the app.
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`. Never commit their values.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `PLAN.md` — approved original assignment plan; preserve it.
- `artifacts/gym-tracker` — React interface and embedded Clerk forms.
- `artifacts/api-server` — shared Express server and protected account endpoint.
- `lib/api-spec/openapi.yaml` — API contract; regenerate clients after editing.
- `lib/db/src/schema` — application database models.
- `prompts` — development-style prompt logs and verification evidence.

## Architecture decisions

- Clerk manages passwords and sessions. The app must never implement local passwords or browser bearer-token handling.
- Application account rows are provisioned idempotently on authenticated account access using Clerk's verified identity, not client-supplied IDs or email.
  **Why:** this keeps account linking reliable without a separate webhook setup for this small assignment.
- The eventual workout editing feature must retain earlier template versions and removed exercises' logged history.
  **Why:** the user explicitly wants routine changes without losing previous exercise data.
- Cascade deletion only from an explicitly deleted session to its own exercises, sets, and stars; restrict deletion of referenced templates, versions, and library exercises.
  **Why:** users may intentionally delete a logged session, but changing or retiring a routine must not erase training history.
- Treat session dates as calendar-only strings and version timestamps as timezone-aware instants.
  **Why:** converting a workout day to a JavaScript timestamp can shift its displayed date across timezones.
- Future API handlers must authenticate and verify every linked record's owner. The schema's ownership foreign keys do not replace request authorization.
  **Why:** the approved model does not duplicate user IDs on every child row; cross-account exercise/version links need explicit server checks.

## Product

- Feature 1 is merged and published: signup, login, logout, and a protected linked-account area.
- Current approved scope: feature 2 only — database models and relationships from the original plan, applied and verified in development.
- Workout CRUD screens, template editing, starring behavior, search, dashboard, and charts belong to later separate features. Their underlying tables do not constitute those features.

## User preferences

- The user chose the app name **LiftLedgr**, with that exact spelling.

- Work in the exact assignment order, not all features at once. Required features stay in assignment order; the three additional features come last.
- Each feature follows GitHub Issue → branch from main → build and prompt log → PR → student merges → publish. Stop for user review before opening the current feature PR.
- Never commit directly to the assignment repository's main branch. The student confirmed instructor approval only for the one-time initialization already completed.
- Prompt logs must be structured development notes, not a dialogue between the user and agent. Preserve actual prompt and relevant response excerpts for reflection evidence.
- Keep feature titles free of “extra #” labels.
- The approved visual direction is dark charcoal with lime green; logging will use pounds, one weight per exercise per session, and editable reps per set.

## Gotchas

- Preserve the GitHub assignment branch ancestry. The provided local template initially had unrelated history; implementation must extend the actual assignment feature branch.
- Do not publish before the student merges the feature PR. Preview is not a published submission URL.
- Do not rewrite original plan sections to match implementation; append Plan vs. Reality only when outcomes exist.
- Replit-managed Clerk development and production accounts are separate; do not treat development-key warnings as failures.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
