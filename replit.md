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
- Workout editing must retain earlier template versions and removed exercises' logged history.
  **Why:** the user explicitly wants routine changes without losing previous exercise data.
- Starting a template session must fetch the latest saved version before opening the draft, then keep that concrete version for the entire draft. An existing logged session's version link cannot be changed.
  **Why:** a cached template or a background update must not silently change the workout that the user actually started.
- Cascade deletion only from an explicitly deleted session to its own exercises, sets, and stars; restrict deletion of referenced templates, versions, and library exercises.
  **Why:** users may intentionally delete a logged session, but changing or retiring a routine must not erase training history.
- Treat session dates as calendar-only strings and version timestamps as timezone-aware instants.
  **Why:** converting a workout day to a JavaScript timestamp can shift its displayed date across timezones.
- Future API handlers must authenticate and verify every linked record's owner. The schema's ownership foreign keys do not replace request authorization.
  **Why:** the approved model does not duplicate user IDs on every child row; cross-account exercise/version links need explicit server checks.
- Dashboard workout series follow the stable workout ID across linked versions. Sessions without a version link are grouped separately by their saved workout name; a matching name is not proof of template identity.
  **Why:** pre-template logs must remain chartable without building feature 8 early or rewriting historical relationships. Do not automatically link old sessions to a new template just because names match.

## Product

- Feature 1 is merged and published: signup, login, logout, and a protected linked-account area.
- Feature 2 is merged and published; the nine production tables and their primary/foreign keys were verified read-only.
- All ten original features, the one-pound weight-arrow fix, and exercise notes are merged and published; both formal tests, the PLAN.md reflection, and schema.md are merged. Current approved scope is README.md only, under its documentation Issue/branch. Stop before opening its PR. After merge, check the remaining assignment/submission instructions rather than assuming submission is complete.
- Template editing is feature 8, per-set editing is feature 9, and repeat-session behavior is feature 10. Their underlying tables do not constitute those features.
- Feature 10 must offer the previous weight, sets, and reps when starting a saved preset, clearly noting that those numbers are what was done "Last time" until the user fills in the new numbers.
  **Why:** the user requested: "yes plan that behavior and make it so it notes that is what you did last time until you fill in the new numbers".
- Session drafts use independent rep strings and stable local keys for each set; weight belongs to the exercise, not the set. New exercises start with three blank rep rows. Adding/removing a row must preserve the other rows' values, and unrelated edits must preserve every saved rep.
  **Why:** the user wants different reps per set with one shared exercise weight; changing a count or an unrelated field must not flatten existing training results.
- Repeating copies the historical session's exercise list/results and original version link into an independent draft. Its date defaults to today; whole-session notes start blank and the original star is not copied. Exercise notes use the latest owned cross-workout history, including an authoritative blank. Archived source workouts must be restored rather than silently dropping their provenance.
  **Why:** repeating means reusing training results for a new occasion, not recording the old occasion again or changing its history.
- Preset suggestions come from the most recent saved session across that workout's version IDs, ordered by session date then ID descending. Match stable exercise IDs (and ordered occurrences for duplicates), not names or row positions. Keep the latest pinned template's list; unmatched exercises stay blank.
  **Why:** renamed/removed/new exercises and unrelated same-name workouts must not inherit misleading previous results. These suggestions mean the last session for this workout, not arbitrary older results from elsewhere.
- Previous-value hints are per-field, disappear when that field is edited even to the same number, and never enter saved payloads. Changing an exercise's identity hides its old result hints without deleting the current draft values.
  **Why:** the user asked for clear "Last time" notation until new numbers are entered; copied suggestions are not newly completed training until Save.
- Feature 8 must let users create a reusable workout without logging a session; saving a workout and logging a dated session are separate actions. **Why:** the user explicitly reiterated that they want to prepare workouts without recording a session.

## User preferences

- The user chose the app name **LiftLedgr**, with that exact spelling.
- Weight input arrows must change the weight by 1 lb per step while still allowing typed decimal weights. **Why:** the user reported 0.01 lb arrow increments as incorrect during the live session check.

- Work in the exact assignment order, not all features at once. Required features stay in assignment order; the three additional features come last.
- Each feature follows GitHub Issue → branch from main → build and prompt log → PR → student merges → publish. Stop for user review before opening the current feature PR.
- Keep the two assignment-required tests in their own separate GitHub Issues and PRs, distinct from feature PRs. **Why:** the student flagged this assignment requirement; routine feature verification does not replace those separate deliverables.
- Do Test A and Test B at the very end, after all 10 app features are complete. Do not open either test's Issue, create its branch, or start its dedicated work earlier. Routine feature verification may continue during development. **Why:** the user explicitly clarified that both required tests belong at the end when the app is complete.
- Each required test PR must include its Given/When/Then plain-English explanation, actual intentional-failure and restored-pass screenshots, one sentence describing a change that would break it, and any agent mistake the student caught (what happened, how noticed, how fixed). **Why:** these are explicit assignment evidence requirements, including credit for the student's judgement.
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
