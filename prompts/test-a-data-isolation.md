# Test A — Data isolation

## Approved scope

Issue #25, dedicated branch `test/data-isolation`, created only after all ten application features were merged and published. Actual approval: “Implement Test A only.” No Test B implementation, PR, merge or publication is part of this step.

Original `PLAN.md` and `prompts/plan.md` are preserved.

## Approved scenario

**Given** User A has a saved workout session and User B has none, **when** User B logs in and opens their workout history, **then** they see no sessions and none of User A's workout data.

## Plain-English explanation

The test creates two synthetic accounts and saves a recognizable workout for A. It first checks A's history really contains that session, including its exercise, weight and unequal reps, so an empty or broken fixture cannot falsely pass. It then asks the real history endpoint for B's history and checks the returned list is empty and contains none of A's session.

B's request is just `GET /api/sessions`; it supplies no guessed session ID. The saved ID is used only to verify A's setup.

The test supplies account identity through a Vitest-only mock. Express routing, request validation, session creation/list queries, nested records, response validation and PostgreSQL are real. It does not test the Clerk provider's login UI or browser cache switching. Existing routine checks still cover direct record ownership; this formal test focuses on the approved normal history scenario.

## Safety decisions

- A rollback alone does not isolate reads: deliberately removing ownership filtering could otherwise read real development records.
- Create private, connection-local PostgreSQL temporary copies of all nine tables. Copy column/check/index definitions, recreate foreign keys, and give numeric IDs private temporary sequences. Route queries use those tables through the transaction; public application records and serial counters are untouched.
- Roll back on both assertion failure and success. Temporary tables, sequences and fixture rows disappear; clear the test-only identities and close the test pool.
- Never weaken the running app. The evidence runner copies source and this same test into an ignored sandbox, mutates only the copied list owner filter, and restores that copy in `finally`.
- Reject a red run unless its actual output shows the intended privacy assertion and A's leaked fixture. A compilation/setup error is not valid red evidence.
- The normal application source is hashed before/after capture and must remain unchanged. No app authentication bypass or test header handling is added to running code.

## Reproduce

From the repository root:

```sh
pnpm --filter @workspace/api-server exec vitest run test/data-isolation.test.ts --reporter=verbose
node artifacts/api-server/scripts/capture-test-a.mjs
```

The capture command requires the existing development database and installed Chromium. It writes ignored output under `generated-artifacts/test-a/`, not into production or the application bundle.

## Actual red, then green

- **Red:** removed only `eq(sessionsTable.userId, userId)` from the copied `listOwnedSessions` query. The same Test A ran against isolated fixtures and exited **1**. B received A's recognizable private workout, Bench press, 135.25 lb and reps 10/8/6 instead of an empty list. The failure was the intended history assertion, not a setup failure.
- **Green:** restored the exact original copied source, ran the same test again, and exited **0**, with **1 test passed**. The intended ownership filter is still present in the actual app source.
- Screenshots show an honest HTML viewer of captured, unedited Vitest stdout/stderr with command, timestamp and exit code. They are not represented as terminal screenshots. Raw logs remain available alongside them.
- `red.png` / `green.png`: real Chromium screenshots of those output viewers.
- `red.txt` / `green.txt`: raw run output and execution metadata.
- `manifest.json`: actual exit codes and source hashes; confirms running source unchanged.
- Full normal API suite subsequently passed: **26 tests across 2 files** (25 existing ordinary checks plus this dedicated Test A).
- No new dependency, schema, server/client source or API-contract change. No workflow restart or republishing was needed for test-only files.

## Actual mistake and correction

The first harness attempt used a bound parameter inside an `ALTER TABLE ... SET DEFAULT nextval(...)` definition. PostgreSQL rejected that DDL, so it was a setup error—not proof of data isolation failing.

The capture runner rejected it as invalid red evidence. Replaced that DDL value with a SQL literal constructed only from the fixed schema table/sequence names, not request input. Then reran the real mutation/restoration sequence successfully. The initial error log is retained separately as `setup-error.txt`.

This was caught by the agent during implementation. The student did not report this mistake; no student-discovered bug or judgment is invented.

## What would break this test

Removing the logged-in user filter from the session-list database query would expose A's session in B's history and make this test fail.

## Student understanding and next gate

The student's own brief explanation is still pending. Ask for it before treating the assignment's understanding requirement as complete.

Stop before opening the Test A PR. Its later description must include this scenario/explanation, both actual screenshots and the failure-condition sentence; if the evidence cannot be embedded automatically, have the student attach the supplied original screenshots rather than inventing image URLs. The temporary break must never be committed or merged.
