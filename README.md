# LiftLedgr — Gym Workout Tracker

Solo app assignment repository.

The student confirmed instructor approval for a one-time repository initialization
exception. Planning and feature work follow linked Issues, branches, and pull requests.

## Current feature

Feature 1 adds email/password signup, login, logout, and a private account screen
using Clerk. A verified signed-in account is linked to a PostgreSQL `users` row.
Workout logging and the other planned features are not implemented yet.

This branch adds **feature 2: the data model**, in development only. It adds the
eight workout-related tables from `PLAN.md` alongside the existing users table.
It does not add workout screens, workout API endpoints, or logging behavior.

## Data model

- `users` owns exercises, workout templates, and sessions.
- `workouts` has dated `workout_versions`; each version has an ordered list in
  `workout_version_exercises`.
- `sessions` optionally links to a workout version. `session_exercises` stores
  exercise-name snapshots and one decimal weight in pounds; `sets` stores each
  set's number and reps.
- `stars` is the single user/session junction table. A composite foreign key
  also prevents starring a session belonging to a different user.
- Stable exercise IDs and saved workout/exercise names support historical
  results across future template edits. Referenced exercises, workouts, and
  versions cannot be deleted accidentally through parent deletion. Library
  entries can be archived instead.
- Explicitly deleting a session cascades only to its session exercises, sets,
  and stars. It does not delete its template versions or exercise-library rows.

These tables provide the structure for later features, not those features'
behavior. Appending new template versions rather than editing old versions will
be implemented in the template feature. Foreign keys are not API authorization:
future handlers must scope every read/write to the authenticated user and check
ownership of all linked records, including exercise and workout-version IDs.

## Tools and structure

- React, Vite, TypeScript, and Tailwind: `artifacts/gym-tracker`
- Express and Clerk authentication middleware: `artifacts/api-server`
- PostgreSQL and Drizzle: `lib/db`
- OpenAPI contract and generated clients: `lib/api-spec`, `lib/api-client-react`,
  and `lib/api-zod`
- Original plan: `PLAN.md`
- Development notes and evidence: `prompts/`

## Run in development

Use Node.js 24 and pnpm 10. Install with `pnpm install --frozen-lockfile`.
Provide `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, and
`VITE_CLERK_PUBLISHABLE_KEY` through secure environment configuration, never
committed files. Replit provisions these for this project.

Apply the development schema with `pnpm --filter @workspace/db run push`.
In Replit, run the managed API Server and Gym Workout Tracker workflows; they
supply the required ports and routing.

For local development outside Replit, run the API with `PORT=8080` and the web
package with `PORT=5173 BASE_PATH=/`, with a same-origin reverse proxy routing
`/api` to Express and other paths to Vite. Cookie-based authentication requires
the UI and API to share an origin. Configure the development host with your
Clerk instance.

Run `pnpm run typecheck` for the full TypeScript check. After changing the API
contract, run `pnpm --filter @workspace/api-spec run codegen`.

### Verify the development data model

After applying the schema, run `pnpm --filter @workspace/db run test`.
The integration test checks all nine table definitions and their keys, decimal
weights, per-set reps, dates, historical snapshots, uniqueness constraints,
foreign-key failures, ownership of stars, and session-delete cleanup.

Fixtures are written in one transaction and rolled back even on failure; no
sample workouts are left in the app. Sequence numbers may have gaps after a
rollback, which is normal. Run this only against development, never production.
These checks do not replace the later assignment-required browser isolation and
dashboard tests.

## Publication

Published app: https://liftledgr-aidangilkerson.replit.app

The currently published release is feature 1. Feature 2 schema changes are
development-only until its PR is merged and the app is published again.
The student must merge each feature pull request before publishing its update.

## Verification boundaries

Type checking, public-page rendering, responsive signup rendering, and signed-out
API protection were checked.

A browser test using Clerk's supported programmatic sign-in also passed: the
real account endpoint returned the linked account, a refresh retained the same
identity and account ID, logout returned to the public homepage, and signed-out
account requests and private-page visits were blocked. No app authentication
bypass, mocked account response, or manually inserted application row was used.

The user additionally confirmed manual signup and account verification,
successful password-based login with the account linked, and remaining signed
in after a refresh. These are user-reported manual results, not automated
coverage of password entry or email delivery. Feature 1's PR was subsequently
merged and published. The user confirmed Google sign-in linked their account
on the live app.
The assignment's workout-isolation and dashboard tests will be added when those
features exist.
