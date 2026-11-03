# Dashboard — development log

## Approved scope and order

Feature 7 only, following the approved plan: all-time session/set/rep totals,
sessions per week, exercise weight and total-reps progression, and workout
volume progression. Issue #17 was opened before `feature/dashboard` was created
from the latest GitHub `main`. The build was separately approved. Stop before
opening its pull request; the student reviews/merges and publishes separately.

Original `PLAN.md` and `prompts/plan.md` are unchanged. Template/version editing,
the individually editable per-set UI, and copying sessions remain features 8–10.
The two formal assignment tests remain separate, end-of-project deliverables.

## Prompt excerpts

- Approved plan: “Selecting an exercise shows separate weight and total-reps
  charts over session dates. Selecting a workout shows session volume over time:
  the sum of weight × reps across its sets.”
- Testing direction: “can you run the test autonomously from now on, this is
  very time consuming”
- Branch approval: “Create feature 7 branch”
- Build approval: “continue”
- Implementation brief: “Build feature7 frontend only for LiftLedgr, a personal
  training ledger for a student who wants real lifting progress while retaining
  prior history.”
- Scope constraint: “Do not touch backend/spec/generated/docs/session
  CRUD/forms/weights/package files.” Frontend design and backend implementation
  therefore had separate file ownership.
- Design response excerpt: “Charts use #61A9BD as the main colour and #CED14E
  for the reps line.” Its initial report explicitly said no browser checks had
  yet been run; that report was not treated as browser verification.

## Implementation decisions

- Added an authenticated, account-scoped `GET /api/dashboard`, documented in
  OpenAPI and regenerated into the React Query client and server Zod schemas.
  The server reads only owned saved history, not client-supplied identity,
  stored derived totals, notes, stars, or provider details.
- Totals count sessions and actual set rows independently, summing each set's
  own reps. Exercise weights retain each entry, including repeated entries on
  the same date. Exercise reps aggregate matching entries within each session.
  Zero reps and zero weight remain valid observations.
- Workout volume sums weight × actual reps across all its sets. Integer cents
  prevent ordinary decimal-pound drift; unsupported numeric precision fails
  explicitly with a safe error rather than displaying an incorrect total.
- Stable exercise IDs preserve historical exercise series even after archive.
  Template-linked sessions group by stable workout ID across versions.
  Pre-template sessions group by the exact saved workout name, clearly marked
  “logged name.” They are not silently linked to a template by name.
- Weeks begin Monday, use calendar dates in UTC for grouping/display, and
  include zero-session gaps through the latest logged week. To bound extreme
  date ranges, the weekly chart shows at most the latest 104 weeks and explicitly
  discloses that window. All-time totals and progress observations are not
  reduced by that weekly window.
- Added protected `/dashboard` and shared navigation. Recharts is loaded lazily
  on that route rather than adding its code to every session screen. Numeric
  time axes preserve elapsed spacing; tooltips and expandable full-data tables
  expose dates, actual observations and units. A visible note explains that
  volume is not direct strength and changing exercises affects comparisons.
- Selections request real server data; chart titles follow the returned
  selection while pending data is dimmed. Refresh, retry, missing-selection
  reset, true zero-history, loading and safe error states are provided.
- Session create/edit/delete invalidate the entire dashboard query prefix, so
  all cached selection variants become stale together. Existing session forms,
  weight stepping, per-set preservation, stars and search/sort remain unchanged.
- No schema changes, dependency additions or authentication changes.
  No chart was deferred under the fallback plan.

## Corrections and verification

- The first version-history fixture omitted its required saved workout name.
  PostgreSQL correctly rejected that fixture; the agent corrected the fixture.
  This was an agent test-setup mistake, not a student-caught application bug and
  not an intentional red/green assignment demonstration.
- Review caught JavaScript's `Date.UTC` behavior that interprets years 1–99 as
  1901–1999. Chart dates now parse the full ISO calendar date instead.
- `pnpm run typecheck`: all workspace packages passed, including frontend and API.
- `pnpm --filter @workspace/api-server run test`: 20 checks passed. The four
  additional routine cases cover actual dashboard history/weekly gaps, repeated
  exercise entries, zero values, archived history, immutable-version grouping,
  decimal volume, bounded extreme ranges, selection validation and safe read
  recovery. Database fixtures roll back; only provider identity is mocked.
- The independently calculated routine fixture is **3 sessions, 7 sets, 21
  reps**; Bench weights **10.25, 20.1, 5.5 lb**, Bench reps per session **12, 6**,
  and Routine volumes **123, 97.4 lb·reps**. Monday counts are **1, 1, 0, 1**.
- `node --test artifacts/gym-tracker/test/*.test.mjs`: all 24 existing client
  checks passed (weight stepping, validation and URL filter behavior).
- The workspace-wide `pnpm run build` stopped at the unchanged mockup sandbox
  because that standalone shell did not provide its managed `PORT`. The API
  built successfully in its managed workflow. Targeted production frontend
  build with `PORT=26029 BASE_PATH=/` passed. Existing tooltip sourcemap and
  greater-than-500 KB entry-chunk warnings are nonblocking; the dashboard is a
  separate lazy-loaded chunk.
- Both app workflows restarted successfully. Startup and dashboard requests
  were clean; development-key warnings are expected in Preview.
- Source-helper checks confirmed exact calendar dates for years 0001, 0099 and
  2026, without installing a TypeScript runtime dependency.
- Signed-in browser verification ran on the confirmed **development Preview**
  origin, using a unique synthetic Clerk account—not the student account and
  not production. Desktop and 402×874 mobile checks confirmed the actual chart
  tables and selectors against the 3/7/21 fixture above. Single zero-value
  observations were visible and their hover tooltip showed the real date and
  units. Mobile had no horizontal document/body overflow; all three navigation
  links worked.
- Editing only the first fixture's weight from 10.25 to 11.25 lb preserved its
  different reps, **7 and 5**, confirmed by the detail view and authenticated
  read. Dashboard weights updated to **11.25, 20.1, 5.5**, volume to **135,
  97.4**, and totals stayed **3/7/21**. Deleting only the third fixture through
  its detail UI updated totals to **2/6/21** and removed its workout choice.
- The initial browser report flagged a missing error after a single simulated
  503. The query intentionally retries transient failures twice, so that
  single failure recovered rather than reaching the error state. A narrow
  follow-up kept all three attempts failing: the friendly dashboard error and
  Retry button appeared. Removing interception and clicking Retry returned a
  genuine server 200 and the correct empty state. This corrected a test-plan
  expectation mismatch; no app/auth/config changes or repeated full journey
  were needed.
- Cleanup removed only the three returned test-session IDs. All three
  subsequent reads returned 404 and the synthetic dashboard returned **0/0/0**.
  No student workout data was changed. The synthetic account/library were not
  deleted. No production-browser verification or intentional feature-break
  screenshots are claimed.
- Routine browser evidence: desktop totals/weekly `idsb4e`; desktop original
  volume/table `4nkrdh`; zero-point tooltip `kagyw1`; mobile updated volume/table
  `rwwdgk`; exhausted-retry error `b7flah`; recovered empty state `xrnxs6`.

## Formal test boundary

These are routine feature-safety checks, not delivery of formal Test A or Test B.
Their separate Issues, branches, PRs, Given/When/Then explanations, genuine
intentional-failure/restored-pass screenshots and “what would break it”
statements must still be completed after all 10 features. No such dedicated
test work or evidence is claimed here.
