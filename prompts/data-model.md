# Data Model Development Log

## Purpose and approved prompt

**Approval prompt excerpt:** “Build feature 2 only”

**Context reviewed before approval:** Build the planned database tables and
relationships for the feature's GitHub Issue on `feature/data-model`. Do not
build workout screens, logging, or later features. Stop after implementation
and verification, before opening the pull request.

**User story:** As a user, I want workout templates, sessions, exercises, and
sets stored with clear relationships and linked to my account, so that my
training history stays organized.

## Implementation scope

- Start from the latest GitHub main, after the student merged feature 1.
- Keep the existing users table and account records unchanged.
- Add the eight remaining tables in the original plan: exercises, workouts,
  workout versions, version exercise entries, sessions, session exercises,
  sets, and stars.
- Export a Drizzle model, insert schema, and derived types for each new table,
  together with the relationships used for future nested queries.
- Apply the schema to the existing development database only.
- Preserve the original `PLAN.md` and its existing planning prompt log.

## Design decisions

**Snapshots and history:** Keep stable exercise IDs together with saved workout
and exercise names. A later routine edit can add a new version without changing
earlier version rows or completed-session snapshots. Archiving is available for
exercise-library entries and templates. Foreign keys restrict deletion of
referenced exercises, templates, and versions.

**Intentional session deletion:** Session exercises, their sets, and their stars
are dependent on that session and cascade when the session is explicitly
deleted. Templates, versions, and library exercises are retained. This only
defines database behavior; the later CRUD feature must provide confirmation.

**Numbers and dates:** Weights are decimal pounds with two decimal places, once
per session exercise. Sets contain whole-number reps, not separate weights.
Rep counts and weights cannot be negative. Positions are zero-based;
version numbers and set numbers start at one. Session dates are calendar days,
while version save times are timezone-aware timestamps.

**Uniqueness:** Enforce workout/version-number pairs, ordered exercise positions
within their parent, set numbers within an exercise, and user/session star
pairs. A composite session/user foreign key also prevents another user from
starring a session they do not own.

**Authorization boundary:** This feature creates no workout endpoints. Database
foreign keys ensure valid references, not general application-level access
control. Future endpoints must scope reads/writes to the authenticated account
and verify ownership of every linked exercise and workout version. Immutable,
append-only template editing is behavior for the later template feature.

**Safe tests:** Run actual database integration checks using uniquely named
synthetic fixtures within one transaction. Roll back every fixture, including
when a check fails. Expected constraint failures use savepoints so they do not
abort the rest of the test. Existing app users and workout data are not removed.

## Relevant response excerpts

> “I’ll build feature 2 only on feature/data-model: the planned database tables,
> relationships, and safeguards for keeping training history. I’ll verify the
> schema and save the development log, then stop before opening a PR.”

> “The eight new tables are in the development database, alongside the existing
> users table. All eight schema test checks passed, including decimal weights,
> relationships, duplicate prevention, and preserving earlier history.”

## Verification results

1. `pnpm run typecheck:libs` — passed.
2. `pnpm --filter @workspace/db run push` — successfully applied the additive
   development schema. No production migration or publishing was performed.
3. `pnpm --filter @workspace/db run test` — passed all 8 reported checks:
   the parent integration test and its 7 focused subtests. Verified:
   - All nine planned table definitions, nine primary keys, and twelve
     foreign-key constraints.
   - Decimal weight and different reps per set, plus a calendar date retained
     with the test connection in a different timezone.
   - Earlier version and session snapshots retained after creating a later
     version, renaming a workout, and archiving/renaming a removed exercise.
   - Duplicate versions, positions, sets, and stars rejected.
   - Required fields, invalid numeric values, and invalid parent links rejected.
   - Other-user starring and deletion of referenced history rejected.
   - Optional template-free sessions and cleanup of only an explicitly deleted
     session's dependent rows.
   - Fixture transaction rolled back and fixture users absent afterward.
4. `pnpm run typecheck` — full workspace check passed.
5. API workflow rebuilt and restarted successfully.
6. Development `/api/healthz` returned HTTP 200 with status ok; signed-out
   `/api/me` still returned HTTP 401.
7. The unchanged public homepage rendered at a phone-sized viewport.

These database checks are not the assignment's later UI isolation/dashboard
tests, and no red/green browser evidence for those future features is claimed.
The previously verified sign-in flow was not retested because its code was
unchanged.

## Delivery boundary

Save implementation and this log to the feature branch. Stop for review before
opening the feature PR. Do not merge, publish, alter the production database,
start feature 3, or add any workout-facing screens or endpoints.
