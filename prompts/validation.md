# Feature 4 — validation development notes

## Approved scope and order

Issue #11 records the approved story: friendly messages for blank required
fields or invalid weights and reps, so users can correct mistakes before saving.
The feature/validation branch was created from GitHub main after the weight-arrow
fix was merged. The student then approved: “Build feature 4 only”.

Initial implementation response excerpt:

> “I’ll build feature 4 only: clear validation messages in create/edit forms,
> focus on the first problem, and keep entered values when saving fails.”

No feature 5 or later behavior is authorized. The two assignment-required tests
remain separate work at the very end, after all 10 app features are complete.
Routine feature-safety checks here do not count as those deliverables.

## Decisions and implementation

- Both create and edit use the existing shared session form.
- Use application validation rather than native pop-up messages, while retaining
  required/type/range attributes for field semantics.
- Show plain-language errors near the corresponding field, link them through
  aria-describedby, mark invalid fields, and focus the first invalid control
  after the error UI has rendered. The summary distinguishes unsaved changes
  from the previously saved record.
- Revalidate after corrections and keep draft values in their existing state.
  Clear stale server field mappings when a row is removed/reordered or edited.
- Preserve existing limits: trimmed nonblank names, real calendar dates with
  four-digit nonzero years, optional notes, 1–50 exercises, 1–100 sets, integer
  nonnegative reps, and nonnegative weights with up to two decimal places.
  Zero weight and zero reps remain valid. No new future-date restriction.
- Keep the one-pound pointer/keyboard arrows and decimal input support.
- An untouched historical differing-reps array is validated without requiring
  a replacement uniform reps value. No per-set editor is added.
- Define optional fieldErrors in the existing OpenAPI error contract first,
  then regenerate the typed React client and Zod validators.
- Continue using generated request validators on the server. Translate their
  field paths to safe friendly messages and also reject whitespace-only names
  and impossible calendar dates. Return HTTP 400 before any database save.
- Map API array paths to the visible set-count/shared-reps fields. Do not expose
  submitted values, internal exceptions, or raw database errors.
- On a network/service failure, show a retry message without resetting or
  navigating away from the draft. Existing saved sessions are unchanged by a
  rejected request.
- No packages, authentication changes, database schema changes, or production
  writes are needed. Preserve PLAN.md and prompts/plan.md.

## Routine verification completed

- Nine API checks passed against development PostgreSQL with rolled-back
  fixtures. Two new checks cover detailed error paths, invalid-edit retention,
  no partial creation, corrected zero-value saves, precision/range boundaries,
  text/list limits, and leap-date acceptance.
- Eighteen client checks passed: nine validation checks plus the nine existing
  weight-arrow checks. The validation checks include historical mixed reps and
  API-to-form error-path mapping. Actual client output is retained outside Git
  in generated-artifacts/feature-4-client-tests.log.
- The canonical full workspace TypeScript check passed after code generation.
- Verification response excerpt:

> “I’m now checking the signed-in error-and-retry flow, particularly that a
> failed save keeps the draft and that an invalid edit cannot overwrite saved
> data.”

## Signed-in browser and build results

- Frontend production build passed. The existing tooltip sourcemap and
  bundle-size warnings remained non-blocking.
- Both managed frontend/API workflows restarted successfully.
- One development-only signed-in browser journey passed at 402×874 using a
  unique synthetic account with a verified primary email. No real user data
  or production data was used.
- Blank submission showed inline errors, linked descriptions and invalid
  states, focused the workout-name input, and sent no create request.
- Negative weight, zero sets, fractional reps, and excessive weight precision
  showed the corresponding messages without sending invalid saves.
- Correcting the draft cleared errors. The weight arrows still changed
  135.25 → 136.25 → 135.25.
- An intercepted HTTP 503 create response kept every draft value on the same
  route and unlocked Save. The real retry returned 201 and survived reload.
- An invalid edit retained its draft, sent no update, and an authenticated GET
  confirmed that the earlier saved values were unchanged.
- An intercepted HTTP 400 update mapped a nested set-reps error to the visible
  reps field, with its description and focus. Values stayed intact.
- Correcting and retrying the update returned 200; reload confirmed valid
  zero-weight/zero-rep values and retained notes.
- Only the session created by this browser run was deleted during cleanup.
  A subsequent read returned 404. No source/configuration edits were made by
  the tester.
- Reviewed mobile screenshots of blank-field and mapped API-reps errors;
  controls and messages were readable without apparent horizontal overflow.
  Expected intercepted 400/503 resource errors were not treated as actual
  service outages. Reload briefly showed initial rendering before content
  initialized; saved values were checked after initialization.

No new implementation failure was reported by this pass. No assignment
red/green screenshots or deferred Test A/B completion are claimed.

## Delivery boundary

Stop before opening the feature 4 PR. The student separately approves opening
it, reviews and merges it personally, then publishes before the next feature.
