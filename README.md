# LiftLedgr — Gym Workout Tracker

LiftLedgr is a personal training journal for creating reusable gym workouts and recording progress without losing earlier results when a routine changes.

**Live app:** [liftledgr-aidangilkerson.replit.app](https://liftledgr-aidangilkerson.replit.app)

Sign up or sign in to use the tracker. Each account has its own workout history. This project was built for a solo school assignment through linked GitHub Issues, branches, development logs, and student-reviewed pull requests.

## What it does

1. **Accounts:** Clerk-powered signup, login, and logout, with email/password and Google sign-in.
2. **Persistent data:** Nine related PostgreSQL tables keep accounts, templates, sessions, exercises, sets, and favorites organized.
3. **Session history:** Create, view, edit, and delete dated workout sessions, with confirmation before deletion.
4. **Validation:** Friendly field errors and first-error focus help correct invalid input without losing the draft.
5. **Stars:** Favorite your own sessions and switch to a starred-only view.
6. **Search and sort:** Find sessions by workout name and order them newest or oldest first; filters persist in the URL.
7. **Dashboard:** See total sessions, sets, and reps; weekly activity; exercise weight/reps over time; and workout volume over time.
8. **Reusable workouts:** Prepare a named exercise list without logging a session. Editing saves a new dated version while preserving earlier lists and completed results.
9. **Per-set reps:** Add/remove sets and record different reps for each set, using one shared weight in pounds per exercise. Weight arrows move by 1 lb while typed decimal weights remain supported.
10. **Repeat and previous results:** Copy a session into a new independent draft, or start a preset with the last session's matching results labeled “Last time” until edited.

**Additional feature:** editable exercise notes carry across all of your workouts by exercise identity. A draft offers the latest saved note, including a deliberately cleared note; older sessions retain their own notes. Whole-session notes remain separate.

Workout volume is the sum of weight × reps, not a direct measurement of strength. Changing exercises affects comparisons. Weekly activity displays at most the latest 104 weeks; summary totals remain all-time.

## Typical use

1. Create an account or sign in.
2. Open **Workouts** to create a reusable routine, or **Sessions** to log an ad-hoc workout.
3. Start a routine, enter its exercise weights and each set's reps, optionally edit notes, and save the session.
4. Return to session history to edit, star, repeat, search, or delete a session.
5. Open **Dashboard** and select an exercise or workout to inspect its progress.

Saving a template does not record completed training. Starting or repeating a workout creates a draft; only saving the session writes the new training record.

## Tools used

| Area | Tools |
|---|---|
| Interface | React, TypeScript, Vite, Tailwind CSS, Wouter, TanStack Query |
| Charts | Recharts |
| Server | Express, Node.js, TypeScript |
| Data | PostgreSQL, Drizzle ORM and Drizzle Kit |
| Validation and API contract | Zod, OpenAPI, Orval-generated clients |
| Authentication | Replit-managed Clerk; no application password storage |
| Tests | Vitest, Supertest, Node's built-in test runner; automated signed-in browser checks during development |
| Development and hosting | Replit Agent, Replit hosting, pnpm workspaces, GitHub Issues/branches/PRs |

## Project structure

- `artifacts/gym-tracker/` — React web interface.
- `artifacts/api-server/` — Express API, authorization, session/template operations, and dashboard calculations.
- `lib/db/` — database models, schema tooling, and schema tests.
- `lib/api-spec/` — OpenAPI contract and client generation.
- `lib/api-client-react/`, `lib/api-zod/` — generated API hooks and validation types.
- `artifacts/mockup-sandbox/` — separate design-preview sandbox; not needed to use the tracker.
- [`PLAN.md`](PLAN.md) — original plan and completed Plan vs. Reality reflection.
- [`schema.md`](schema.md) — all nine tables, their columns/relationships, and comparison with the planned model.
- [`prompts/`](prompts/) — structured development logs, corrections, and verification evidence.

## Run in development

### 1. Prerequisites and installation

Use **Node.js 24**, **pnpm 10**, a development PostgreSQL database, and configured Clerk authentication. From the repository root:

```sh
pnpm install --frozen-lockfile
```

Use pnpm, not npm or Yarn; the repository's install script enforces this.

### 2. Configuration

Provide these through secure environment configuration. Never put real values in committed files or documentation.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Development PostgreSQL connection used by the API, schema tooling, and database tests. |
| `CLERK_SECRET_KEY` | Server-side Clerk credential; never expose it to browser code. |
| `CLERK_PUBLISHABLE_KEY` | Clerk publishable key used by the server. |
| `VITE_CLERK_PUBLISHABLE_KEY` | Matching browser publishable key, available when Vite starts/builds. |
| `PORT` | Each service's listening port; API and frontend need different ports. |
| `BASE_PATH` | Required by the frontend; `/` for this app's root mount. |

In this Replit project, the managed services supply ports and routing, and Clerk is provisioned through Replit. Development and published Clerk accounts are separate. Use the Auth pane for managed authentication settings rather than replacing credentials.

`SESSION_SECRET` is not required by this app's current Clerk authentication. The frontend also supports `VITE_CLERK_PROXY_URL` when a hosting configuration supplies a Clerk proxy; it is not required for the normal development setup.

### 3. Apply the development schema

With `DATABASE_URL` pointing to your **development** database:

```sh
pnpm --filter @workspace/db run push
```

Review any proposed changes before accepting them. Do not use force-push commands or point this setup step at production.

### 4. Start the app in Replit

Run the existing managed workflows:

- **API Server:** `pnpm --filter @workspace/api-server run dev`
- **Gym Workout Tracker:** `pnpm --filter @workspace/gym-tracker run dev`

Open the Gym Workout Tracker Preview. Replit routes the frontend and `/api` through the same origin, which is required for cookie-based authentication. The design sandbox workflow is separate.

### Outside Replit

The repository does not include a standalone local reverse-proxy configuration. To run outside Replit, configure your own development PostgreSQL database, Clerk instance/allowed host, environment variables, and a same-origin reverse proxy. Start these in separate terminals:

```sh
# API
PORT=8080 pnpm --filter @workspace/api-server run dev
```

```sh
# Web interface
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/gym-tracker run dev
```

Route `/api` to Express on port 8080 and other paths (including Vite's development WebSocket) to port 5173. Visit the proxy's configured origin, not two unrelated frontend/API origins. The port assignments above are examples for local development, not replacements for Replit's managed routing. This external setup is documented from configuration; a fresh external-machine installation has not been verified.

## Checks and builds

Run from the repository root after installing dependencies:

```sh
# Full workspace TypeScript check
pnpm run typecheck

# Client helper/validation checks (no database)
node --test artifacts/gym-tracker/test/*.test.mjs

# API tests, including the two formal assignment tests (development DB required)
pnpm --filter @workspace/api-server test

# Database schema/constraint checks (development DB required)
pnpm --filter @workspace/db test
```

Database-backed checks create synthetic fixtures and roll them back. Do not run them against production. Tests mock provider identity inside the test process; the running app has no test-login bypass.

If changing the API contract, regenerate shared clients/types before checking:

```sh
pnpm --filter @workspace/api-spec run codegen
```

Targeted production builds:

```sh
pnpm --filter @workspace/api-server run build
PORT=26029 BASE_PATH=/ pnpm --filter @workspace/gym-tracker run build
```

The API build writes `artifacts/api-server/dist/index.mjs`; the frontend build writes `artifacts/gym-tracker/dist/public/`. A build alone does not configure hosting or publish the app. Root `pnpm run build` also builds the separate sandbox, whose Vite configuration needs its own service environment; use managed builds or the targeted commands above rather than assuming an unconfigured root build is a complete launch command.

## Assignment tests and evidence

Both required tests were added in separate Issues and merged PRs after the original ten features:

- **[Test A — data isolation, PR #26](https://github.com/aidangilkerson-cpu/gym-workout-tracker/pull/26):** User A has a session; User B has none. User B's history must remain empty. Removing the user filter made the test fail; restoring it passed. See [`prompts/test-a-data-isolation.md`](prompts/test-a-data-isolation.md).
- **[Test B — dashboard calculation, PR #28](https://github.com/aidangilkerson-cpu/gym-workout-tracker/pull/28):** two sessions with reps 10/8/6 and 12/10/8 must yield **2 sessions, 6 sets, and 54 reps**. Counting sets instead of summing reps failed; restoration passed. See [`prompts/test-b-dashboard-calculation.md`](prompts/test-b-dashboard-calculation.md).

Each PR includes the plain-English explanation, actual failing/passing screenshots, and a change that would break the test. Intentional breaks were isolated and never merged. These focused tests do not prove every authorization or dashboard behavior.

The evidence-capture runners are documented in their logs; they need development-only fixtures and installed Chromium and write ignored output under `generated-artifacts/`. They are not normal application startup commands.

## Verification and publishing boundaries

The ten original features, the weight-arrow fix, and exercise notes are merged and published. Automated API/client/schema checks and signed-in Preview journeys supported development. The student also verified signup and live-app behavior. Detailed logs distinguish automated checks, student-reported results, simulated errors, and agent-caught corrections; Preview browser checks are not presented as published-site browser verification.

The live URL above was confirmed from current deployment metadata while preparing this README. This documentation change does not publish or modify the running application. The student reviews and merges each PR before publishing application updates.
