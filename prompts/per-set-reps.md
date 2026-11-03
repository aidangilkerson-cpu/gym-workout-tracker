# Per-set rep logging

## Approved scope and order

Feature 9 only, after the merged and published workout-template feature. The Issue and branch were created in separately approved steps. This build must stop before opening its pull request; the student still reviews/merges and publishes personally.

Original `PLAN.md` and `prompts/plan.md` remain unchanged. Feature 10's repeat/previous-results behavior and “Last time” labels are not implemented here. The formal data-isolation and dashboard tests remain separate end-of-project Issues/branches/PRs after all ten features; these routine checks are not their intentional red/green evidence.

## Requirement excerpts

- “Build feature 9 only”
- “the weight should be the same for each set but the reps should be editable”
- “I found an issue, different sets might have differnt reps and there is no way to log that.”
- “can you run the test autonomously from now on, this is very time consuming”

## Implementation brief excerpt

> Replace single uniform reps/set-count exercise controls with independently editable numbered set rows, add/remove controls, exactly ONE shared exercise weight (existing WeightInput) for new ad-hoc, template-start, and existing-session edits.

> Stable React keys must be local key notarrayindex.

## Decisions and behavior

- Reused the existing session API and nine-table model. Individual set reps and set ordering already exist on the server; no schema, API contract, generated client, dependency, or authentication changes.
- Extracted pure draft helpers into `src/lib/session-draft.ts`. Draft rep values remain strings so blank fields are distinct from an explicitly entered zero.
- Loaded records preserve each actual rep in saved set order. New exercises retain the existing default of three initial sets, now as three blank rep rows rather than a shared rep count.
- Each exercise has one weight field labeled for all its sets. Decimal pounds, explicit zero, and one-pound arrow increments remain unchanged.
- Set rows use stable local keys. Add appends a blank row and focuses it. Remove preserves the other values and focuses a surviving row; visible and saved numbering remain consecutive.
- Removal is disabled for the last remaining set, and addition is disabled at 100. The existing 1–100-set contract and 0–2,147,483,647 whole-rep range remain unchanged.
- Each row has its own validation path, inline message, accessible label, and invalid-field focus. Server errors retain the exact set index instead of being flattened into one shared reps error. Paths outside the current draft are ignored.
- Payload conversion sends actual rep arrays without local keys. It explicitly rejects blank/non-finite numeric fields instead of silently converting them to zero; field validation runs first.
- Kept template-version pinning and create-only source-version linkage. Editing a logged session does not relink its original version or change template history.
- Kept existing successful-save cache invalidations and navigation, draft-preserving failures, unsaved navigation/Cancel guards, and the 50-exercise bound. Added an immediate submitting ref to block duplicate submits.
- Existing session detail already displays per-set reps; it did not need a second implementation.

## Verification

### Automated regression checks

- `node --test artifacts/gym-tracker/test/*.test.mjs`: **30 passed**. Six new pure-draft checks cover unequal saved values and ordering; stable keys while editing/adding/removing; minimum/maximum rows; blank ordered template seeds; dirty snapshots/unrelated edits; and blank/non-finite versus explicit-zero conversion.
- Updated existing client-validation checks for the new per-set draft shape, preserving date/text/weight bounds and testing exact nested rep errors rather than obsolete shared-reps fields.
- `pnpm --filter @workspace/api-server run test`: **24 passed**, using real PostgreSQL rollback-only fixtures. Server source is unchanged.
- `pnpm run typecheck`: passed across shared libraries, API, app, sandbox and scripts.
- `PORT=26029 BASE_PATH=/ pnpm --filter @workspace/gym-tracker run build`: passed. Existing non-blocking sourcemap and initial-bundle-size warnings remain.
- Frontend managed workflow restarted successfully. The unchanged API remained running; no unnecessary server restart or unrelated sandbox build change.
- Whitespace check passed; original planning files, server, database and API contract remain unchanged.

### Signed-in browser verification

**Passed** using a new isolated synthetic Clerk account. The actual browser origin was confirmed as the project's `.replit.dev` Preview, not the published site. No authenticated production check is claimed.

- New sessions began with three blank rep rows and one shared exercise weight. Blank, fractional and negative reps showed errors/focus on the correct row; explicit zero was accepted.
- Add/remove-middle operations retained surviving values and sequential labels. A UI save and reload persisted one weight of 135.25 lb with distinct reps 10/8/6.
- A deliberately intercepted HTTP 400 field-error response mapped to set 2, not a shared reps or weight field. Editing cleared the error. A separate intercepted HTTP 503 preserved the draft and allowed a successful retry. These were browser-only simulated responses, not genuine application failures, and neither intercepted request reached the backend.
- Editing only the middle set and adding a zero-rep set saved 10/7/6/0. A notes-only save preserved those values and the weight. Removing the extra set saved 10/7/6; the dashboard refreshed to 1 session, 3 sets and 23 reps instead of stale 24.
- A template-start draft retained three initial blank rows, its source-version banner and its entered values when the template changed to a new version elsewhere. Removing down to one set disabled further removal; adding focused a new blank row. Saving weight 0 with reps 0/5 retained the original template-version link, verified through the authenticated API.
- At 402×874, individual rows and the shared weight were usable with no document/body horizontal overflow. Cancel → Keep editing retained unsaved values. Cancel → Discard left the saved 0/5 unchanged.
- Cleanup deleted only the two synthetic sessions, verified 204 followed by 404 for each, and archived the synthetic workout while retaining both immutable versions. No student records were changed.

Routine browser captures: desktop row editor `st7fdw`, mobile editor `29rh9n`, refreshed dashboard `rmxf9t`, template-linked saved session `jnbt4k`. The desktop capture shows the additional row before its zero was entered; saved zero values were independently confirmed by API responses and reloads.

No application defect required a correction during this verification. Existing validation tests were adapted to the intentionally changed draft contract, not weakened to accept invalid inputs. No formal assignment red/green test was created or claimed.

## Next workflow gate

Stop for separate approval to open the feature-9 pull request. Do not merge, publish, start feature 10, or begin the two formal assignment tests in this build step.
