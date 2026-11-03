# Reusable workout templates with change history

## Scope and sequence

Feature 8 only, following its approved GitHub Issue and branch. No pull request, merge, or publish is included in this build step. The original `PLAN.md` and `prompts/plan.md` are unchanged.

Per-set rep editing remains feature 9; repeating a previous session remains feature 10. Formal assignment Test A and Test B remain separate end-of-project Issues and PRs. The checks below are routine feature verification, not their intentional red/green evidence.

## Approved input excerpts

- “Build feature 8 only”
- “I want to be able to create a workout without logging a session”
- “biggest thing I want to revise is I want to be able to edit a workout I previously created. Sometimes I might want to change it. There should be a way to track those changes and not lose data for an exercises that was previously included but now isn't”
- “can you run the test autonomously from now on, this is very time consuming”
- “test A and B should be done at the very end when the app is complete”

## Implementation direction

The approved direction was to create named, ordered exercise lists; edit them later; inspect dated earlier versions; and start sessions from the latest version. Saving an edit creates a new version rather than overwriting earlier snapshots.

Focused frontend brief excerpt:

> Main agent adds SessionForm prop templateVersion?:WorkoutVersionRecord; it seeds blank-result exercise rows from that version and submits its concrete workoutVersionId. Never fake server records/IDs to seed a draft.

Freshness correction in the implementation brief:

> One important session-start freshness detail: if workout detail is already cached from its page, do not pin that stale cached version immediately.

> After pinning, background refetches/errors must not unmount/reset the live form or change the version banner.

## Decisions and resulting behavior

- Reused all nine existing tables. No migration, new table, dependency, authentication-provider change, or replacement database.
- Workouts are reusable names and ordered exercise lists, not completed training records. Template creation saves version 1 atomically and never creates a session.
- Editing appends an immutable numbered snapshot with its own saved timestamp, workout-name snapshot, ordered exercise names, and stable exercise IDs.
- A transaction locks the account before saving a workout or session. Edits must supply the version that the editor started with; a stale editor gets HTTP 409 instead of overwriting another save.
- No template/history deletion endpoint. Archive and restore save an explicit desired boolean, making retries safe. Archiving preserves versions, logged results, and chart access.
- Active owned exercise choices can be selected, or a new name entered. Changing a typed name clears an obsolete selected ID. An already-retained archived library exercise can remain in its current template, but archived exercises are not offered as new choices.
- Session drafts fetch the latest template version, seed its name and exercises with blank results, and pin the concrete version until the explicit session save. Opening a draft does not log training.
- The server validates linked versions and exercises against the authenticated account. Unrelated session edits keep the original version link; attempts to change that link are rejected.
- Existing ad-hoc sessions remain unlinked. No name-based historical relinking.
- Existing dashboard grouping already combines linked versions under their stable workout identity. Removed logged exercises remain chartable, even when absent from the latest template.
- Recoverable failures retain drafts. Library-loading failures are visible and prevent saving with an unavailable choice list. Forms prevent duplicate submits, guard unsaved navigation, and avoid writing another account's late mutation result into the cache.

## Verification and corrections

### Automated API checks

Command: `pnpm --filter @workspace/api-server run test`

Final result: **24 passed** against real PostgreSQL, with rollback-only fixtures. Four routine cases cover version/history preservation and concrete session provenance; archive/restore; stale edits and rollback/recovery; and validation/linked-record authorization.

An initial run had **23 passed, 1 failed**. An older test expected a client-supplied workout-version ID to be silently ignored, because templates were not previously available. Feature 8 deliberately makes that ID meaningful and validates ownership. The outdated assertion was corrected: unsafe links now return 404, while the owner is still derived on the server. All 24 then passed. This was an obsolete test expectation, not a reason to weaken authorization.

### Client checks and builds

- `node --test artifacts/gym-tracker/test/*.test.mjs`: **24 passed**.
- `pnpm run typecheck`: passed for shared libraries, API, app, sandbox, and scripts.
- `pnpm --filter @workspace/api-server run build`: passed.
- `PORT=26029 BASE_PATH=/ pnpm --filter @workspace/gym-tracker run build`: passed.
- Existing non-blocking sourcemap and initial-bundle-size warnings remain. No unrelated sandbox build configuration changed.
- Managed API and web workflows restarted successfully; startup logs show both serving normally.
- `git diff --check`: passed. Original planning files remain unchanged.

### Signed-in browser verification

**Passed** in Preview using a new isolated synthetic Clerk account, with the actual `.replit.dev` origin confirmed after programmatic sign-in. No signed-in production verification is claimed.

- Created a workout through the UI; blank-name validation focused the name field, and add/remove/both reorder directions worked. Version 1 retained Bench → Row. Sessions stayed empty after template creation.
- Seeded one owned historical session through the authenticated API, including unequal saved reps (7, 5). A UI edit created version 2, Squat → Bench, with a changed workout name. Version 1 and the entire historical session record remained exactly unchanged. Removed Row remained selectable in exercise progress.
- Started a version-2 draft, then created version 3 through an authenticated API request while that draft stayed open. Its version-2 name, ordered exercises, and provenance remained pinned. Weight and reps began blank; the existing generic session composer still defaults set count to 3, not a stored template setting.
- Saved actual results through the UI and confirmed the saved session linked to version 2, including after reload. The decimal-weight arrows changed 135.25 → 136.25 → 135.25. A fresh start picked version 3; canceling the untouched draft added no session.
- Created version 4 while a version-3 editor had unsaved changes. Its stale save returned 409 without creating another version or overwriting the current one. The draft remained intact. Keeping the draft and then explicitly discarding/loading the latest both worked.
- Archived and restored through the UI. All four versions remained readable; archived workouts disappeared from the active list, appeared with Show archived, and could not start new sessions. Dashboard progress combined both logged sessions under one stable template identity.
- Intercepted exercise-library requests as 503 through all retries. The failure banner appeared, Save stayed disabled, and the typed draft name remained. Removing the interception and retrying recovered the choices without losing the draft.
- Desktop and 402×874 mobile checks passed. All four navigation links, history, and multi-row form controls were usable; document/body scroll width did not exceed client width.
- Expected intercepted 503 and deliberate 409 resource errors occurred; no uncaught runtime crash. Non-blocking development-provider/WebGPU warnings remained.

Cleanup deleted only the two synthetic sessions, verified 404 for each, and archived—not deleted—the synthetic workout. Its four immutable versions and library identities remain in the isolated test account; its active workout list and sessions are empty. No student records changed.

Screenshot evidence from the browser run: desktop version history `hc4i43`; pinned draft `50dk78`; stale conflict `rcimun`; mobile history `ez2e0o`; mobile form `0fq4dt`; library failure/recovery `54px6p` / `whqeg3`.

## Next approved workflow step

Stop for permission to open the feature-8 pull request. The student still reviews/merges and publishes personally. Do not begin feature 9 or either formal assignment test in this step.
