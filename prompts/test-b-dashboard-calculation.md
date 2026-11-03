# Test B — Dashboard calculation

## Approved scope and actual prompt

Issue #27; dedicated branch `test/dashboard-calculation`, created from merged main after Test A PR #26 was merged.

Actual approval: “Implement Test B only.”

No PR, merge, publication, Test A rewrite or application feature change is included in this build step. Original `PLAN.md` and `prompts/plan.md` are unchanged.

## Approved Given / When / Then

**Given** a user has two sessions containing three sets each, with rep counts **10, 8, 6** and **12, 10, 8**, **when** their dashboard totals are calculated, **then** the dashboard reports **2 sessions, 6 sets, and 54 total reps**.

## Plain-English explanation

The test saves two actual synthetic workout sessions for one account. It checks the saved history contains exactly the six planned rep values and the database contains six set rows. It then requests the real dashboard endpoint as that account and checks its totals against the literal expected values: 2 sessions, 6 sets and 54 repetitions.

The manual calculation is **(10 + 8 + 6) + (12 + 10 + 8) = 24 + 30 = 54**. Counting the six sets would not tell us the number of repetitions completed.

This is a server-request integration test, using Vitest/Supertest and real PostgreSQL. Only the identity-provider boundary is mocked in the test file. Session writes, nested saved results, database queries, dashboard calculation and response validation are real. It does not exercise Clerk's login UI or dashboard rendering in a browser.

## Implementation decisions

- Added `test/dashboard-calculation.test.ts`; kept the finalized Test A file and its evidence runner byte-for-byte unchanged so the separate deliverables remain independently reviewable.
- Reused Test A's safe approach in a self-contained harness: private temporary copies of all nine tables with column/check/index definitions, recreated foreign keys and private serial sequences.
- Setup asserts actual saved values through history and the six database rows before checking the summary. The expected 54 is a literal checked by hand, not a second copy of the production formula or a mocked response.
- Fixture reads/writes stay isolated even during the deliberate mutation. Transactions roll back temporary objects and rows on both success and failure; identities are cleared and the test pool closes.
- Added `scripts/capture-test-b.mjs`. It copies source and the same test into an ignored sandbox, changes only the copied total-reps calculation, and restores that copy in `finally`. It verifies the real app source hash remains unchanged.
- A capture is rejected unless red fails at the intended 6-versus-54 assertion. Setup, compilation and unrelated failures cannot be accepted as assignment evidence.
- Generated evidence stays in ignored `generated-artifacts/test-b/`, not in Git or deployment output. Original screenshots are supplied separately through the Library for later PR attachment.

## Actual red, then green

**Red:** in the isolated source copy, replaced:

```ts
for (const set of entry.sets) totalReps += set.reps;
```

with:

```ts
totalReps += entry.sets.length;
```

The same Test B exited **1**. The session-count and set-count checks passed, then the intended assertion failed: **expected 54, received 6**.

**Green:** restored the exact original copied calculation and reran the same test. Exit **0**; **1 test passed**.

The real `dashboard-store.ts` was never changed. Hashes confirm the restored sandbox source matches the running app source. Compared the captured test with the actual test file as well; they match.

## Verification and evidence

- Focused actual red/green capture completed successfully.
- Full normal API suite: **27 tests passed across 3 files** (25 existing ordinary tests, formal Test A and formal Test B).
- Reviewed both actual evidence screenshots. They display a clearly labeled HTML viewer of unedited captured Vitest stdout/stderr, with command, timestamp and actual exit code; they are not presented as terminal screenshots.
- `red.png` and `green.png`: real Chromium screenshots of those viewers.
- `red.txt` and `green.txt`: raw actual run output and execution metadata.
- `manifest.json`: source hashes, timestamps and exit codes; confirms actual application source unchanged.
- `git diff --check` passed. Original plan, planning log, application source, shared libraries and finalized Test A implementation remain unchanged.
- Preview landing page still rendered normally. No service code, dependencies, API contracts or schema changed, so no workflow restart or republishing was needed.
- No student records were modified by the formal Test B fixture. Its private sequences also avoid consuming public application IDs.

## Actual capture-tool mistake and correction

The first test run failed correctly at **6 versus 54**, but the evidence runner initially expected the reporter to format the value as `Received: 6`. This installed Vitest reporter instead printed an expected/received diff and `expected 6 to be 54`.

The guard stopped capture rather than claiming success. Updated it to require the actual intended assertion message and observed 6-versus-54 error, then reran the complete red/restored-green capture. The first rejected capture log remains separately as `capture-guard-error.txt`.

This was an agent-caught capture-tool format mistake, not an application bug or a student-reported discovery. No student judgment or bug report is invented.

## Reproduce

From repository root, with the existing development database and Chromium available:

```sh
pnpm --filter @workspace/api-server exec vitest run test/dashboard-calculation.test.ts --reporter=verbose
node artifacts/api-server/scripts/capture-test-b.mjs
```

The runner rejects production mode and never writes the temporary break to actual app source.

## What would break this test

Replacing the sum of saved rep counts with a count of set rows would return 6 total reps instead of 54 and make this test fail.

## Student understanding and next gate

The student supplied this purpose and failure explanation in their own words:

> this test ensure that the dashboard accurately reflects workouts being saved. this test would fail if the dashbaord mixed data types

After clarification about sets versus repetitions, the student revised the failure description:

> It would fail if the dashboard mixed different types of sets and reps

The agent explained that this is a measurement mix-up, not a programming data-type mismatch: counting six set rows gives 6, whereas adding the saved rep counts gives 54. Asked how many total reps the six planned sets contain, the student answered **54**.

The student identified the dashboard's purpose, related the failure to sets/reps, and confirmed the correct numeric total. The precise technical clarification above is the agent's wording, not an invented student quote.

Stop before opening the separate Test B PR. Its eventual description must contain the scenario/explanation, actual red/green screenshots, failure-condition sentence and honest correction above. Keep it a draft until both screenshots are attached; use actual uploaded attachment links, never invented image URLs. Student review/merge remains student-controlled.
