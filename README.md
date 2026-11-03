# LiftLedgr — Gym Workout Tracker

Solo app assignment repository.

The student confirmed instructor approval for a one-time repository initialization
exception. Planning and feature work follow linked Issues, branches, and pull requests.

## Current feature

Features 1 and 2 are merged and published: Clerk accounts and the nine-table
workout data model.

This branch adds **feature 3: session create / read / update / delete** in
development. Signed-in users can save dated sessions with exercise entries, read
their history and session details, edit a session, and delete it after
confirmation. A session exercise uses one weight in pounds and, for this basic
editor, a set count with the same reps for every set.

The account screen links to `/sessions`; create, detail, and edit routes are
`/sessions/new`, `/sessions/:id`, and `/sessions/:id/edit`.
Advanced individually editable per-set reps remain feature 9. If existing saved
reps differ, this editor preserves them unless sets/reps are explicitly changed.
Friendly field validation, stars, search/sort, dashboards, reusable templates
with version history, and repeat-session behavior remain their separate later
features. No later feature is claimed as complete.

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
session handlers derive the account from Clerk, scope reads/changes to that
account, and validate any supplied exercise identity. New sessions cannot accept
a client-assigned workout-version link; edits preserve an existing link.
Future template handlers must also check ownership of linked versions.

## Session API and verification

`GET /api/sessions`, `POST /api/sessions`, and
`GET / PUT / DELETE /api/sessions/:id` require a verified signed-in account.
Saves atomically update session metadata, exercise snapshots, and sets.
A failed replacement rolls back, retaining the old saved session. Editing one
session never edits another session, its template versions, or the library's
exercise names. Deleting one session does not delete its referenced history.
Responses containing session or account data are marked `no-store`.

Run the real-development-database API tests:

```sh
pnpm --filter @workspace/api-server run test
pnpm run typecheck
```

The seven routine Vitest + Supertest tests use real PostgreSQL; only provider identity is
substituted within the test process. Each fixture rolls back, even on failure.
There is no test-login header or authentication bypass in the running app.
Never run fixture tests against production.

These are routine feature-safety checks, not the two separate assignment test
deliverables. Both required tests come at the very end, after all 10 app features
are complete; do not start their Issues, branches, or dedicated test work earlier.
The required data-isolation scenario and dashboard-calculation
scenario will each be added through their own Issue, branch, and PR, with the
required explanation, failing/passing screenshots, and what-would-break-it
sentence. No assignment Test A evidence needs to be attached to the feature 3 PR.
See `prompts/crud.md` for the development log and the student-caught correction
that separated the prematurely bundled assignment test from this feature.

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

The published app includes features 1 and 2. Feature 3 is development-only
until its PR is reviewed, merged, and the app is published again.
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
