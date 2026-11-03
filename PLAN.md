# Gym Workout Tracker — Original Plan

## 1. Pitch

I'm building a gym workout tracker because I want to create reusable workouts and keep a history of my training. I expect to use it 3–4 times a week this semester. Each logged exercise has one weight in pounds and an editable rep count for each set. I can edit saved workout templates with a dated version history, keeping earlier exercise lists and logged results even when an exercise is removed. I can repeat a previous session without changing the original.

## 2. Features — in build order

The seven required features remain in the assignment's order, followed by my three extra features.

1. **Sign up and login:** As a user, I want to create an account, log in, and log out, so that I can securely access only my own workout data.
2. **Data model:** As a user, I want workout templates, sessions, exercises, and sets stored with clear relationships and linked to my account, so that my training history stays organized.
3. **Create / read / update / delete:** As a user, I want to add a dated session with exercises, view my session list, open session details, edit a session, and delete it after confirmation, so that my history stays accurate.
4. **Validation:** As a user, I want friendly messages for blank required fields or invalid weights and reps, so that I can correct mistakes before saving.
5. **Stars:** As a user, I want to star my sessions and see a starred-only view, so that I can quickly find favorites. All users' stars use one junction table.
6. **Find things:** As a user, I want to search sessions by workout name and sort by date, newest or oldest first, so that I can find past workouts.
7. **Dashboard:** As a user, I want total sessions, total sets, total reps, a sessions-per-week chart, and exercise- and workout-specific progress charts, so that I can understand consistency and progress. Selecting an exercise shows separate weight and total-reps charts over session dates. Selecting a workout shows session volume over time: the sum of weight × reps across its sets. Volume is not a direct measure of strength, and changing exercises can affect comparisons.
8. **Reusable workout templates with change history:** As a user, I want to create named exercise lists, edit them later, view dated previous versions, and start sessions from the latest version, so that my routine can change without losing earlier exercise lists or logged results. Saving an edit creates a new version rather than overwriting the previous one. Removed exercises remain visible in earlier versions, past sessions, and exercise progress charts when they have logged data.
9. **Per-set rep logging:** As a user, I want to add or remove sets and edit each set's reps, using one weight per exercise in a session, so that I can record what I completed. A later session can use a different weight.
10. **Repeat a session:** As a user, I want to copy a previous session's exercises, weights, and reps into a new dated session, so that I can adjust it without changing the original.

**Workflow:** Before building any feature, open a planning Issue, create a branch, add this file at the repository root, open a linked pull request, and merge it. Then build each numbered feature separately: Issue with its user story → branch from main → implementation and key prompts in `prompts/<feature>.md` → PR with `closes #N` → student merges → deploy. No direct commits to main. This sequence produces 11 merged PRs including the plan, before any additional fixes or documentation PRs.

Feature 1 includes the essential users table needed for login. Feature 2 adds the workout-related data model. Later features extend the app in the listed order; earlier dashboard totals must remain correct as logging capabilities expand.

## 3. Database

Types below use text, number, and date. IDs marked PK are primary keys; links marked FK are foreign keys. Counts, rep counts, positions, and numeric IDs are whole numbers; weight can include decimals. Optional fields may be empty.

| Table | Columns |
|---|---|
| `users` | `id`: text PK; `auth_id`: text, unique; `email`: text |
| `exercises` | `id`: number PK; `user_id`: text FK → users; `name`: text; `archived`: true/false |
| `workouts` | `id`: number PK; `user_id`: text FK → users; `name`: text; `archived`: true/false |
| `workout_versions` | `id`: number PK; `workout_id`: number FK → workouts; `version_number`: number; `workout_name`: text; `saved_at`: date including time; unique workout/version-number pair |
| `workout_version_exercises` | `id`: number PK; `workout_version_id`: number FK → workout_versions; `exercise_id`: number FK → exercises; `exercise_name`: text; `position`: number |
| `sessions` | `id`: number PK; `user_id`: text FK → users; `workout_version_id`: optional number FK → workout_versions; `workout_name`: text; `date`: date; `notes`: optional text |
| `session_exercises` | `id`: number PK; `session_id`: number FK → sessions; `exercise_id`: number FK → exercises; `exercise_name`: text; `weight_lb`: number; `position`: number |
| `sets` | `id`: number PK; `session_exercise_id`: number FK → session_exercises; `set_number`: number; `reps`: number |
| `stars` | `id`: number PK; `user_id`: text FK → users; `session_id`: number FK → sessions; unique user/session pair |

Relationships:

- One user owns many exercises, workout templates, and sessions.
- One workout has many dated versions. Its name reflects the latest version, while each version preserves its saved name.
- Workout versions and exercises are many-to-many through `workout_version_exercises`.
- One workout version has many sessions; a session can also exist without a template. Versions connect sessions to the same workout for workout-level charts.
- One session has many session exercises; one session exercise has many sets.
- Users and starred sessions connect through the single `stars` junction table.

History and privacy:

- The nine tables preserve both template revisions and completed sessions. Creating a template saves version 1; saving an edit creates the next version with a timestamp and a snapshot of its name and ordered exercise list.
- A template history view lists its versions and lets the user inspect each version's exercise list to see additions, removals, and order changes.
- Template edits never change saved sessions. Each session keeps its original version link and its own workout/exercise name snapshots; stable exercise IDs connect progress across versions.
- Removing an exercise from a template only leaves it out of the new version. It does not delete the exercise record, earlier version entries, session exercises, sets, weights, or reps.
- Workout-level charts include sessions from all versions of that workout. Exercise chart selectors include exercises with historical session data even if they are absent from the current template.
- Retiring templates or exercise-library entries archives them rather than deleting their history. Archiving hides them from new-workout choices but does not hide their historical results. Explicitly deleting a logged session remains a separate, confirmed action.
- Repeating a session creates independent session, session-exercise, and set records.
- Server-side ownership checks protect every read and change, including linked records. Users can only star their own sessions.
- Dashboard totals are computed from saved records, not separately stored totals. All weight uses pounds.

## 4. Tests

**A. Data isolation**

Given User A has a saved workout session and User B has none, when User B logs in and opens their workout history, then they see no sessions and none of User A's workout data.

This checks that one account's history is not exposed to another. Removing user-based filtering from the session-list query would make it fail. Server ownership checks must also prevent unauthorized direct access to records.

**B. Dashboard calculation**

Given a user has two sessions containing three sets each, with rep counts of 10, 8, 6 and 12, 10, 8, when their dashboard totals are calculated, then the dashboard reports 2 sessions, 6 sets, and 54 total reps.

This checks totals against a small, manually verifiable dataset. Counting set rows instead of summing reps for total reps would make it fail.

In each relevant test PR, include a plain-English explanation, a screenshot of the test failing after a temporary intentional break, a screenshot passing after restoring correct code, and what would break the test. Never merge the intentional break. Save meaningful prompts and responses, including mistakes and corrections, for reflection evidence.

## 5. Technologies

- **Replit Agent:** Build and explain one feature at a time under this plan and the GitHub workflow.
- **React and TypeScript, with Express:** Provide the interface and a server for validation, ownership checks, and database operations; TypeScript helps catch coding errors.
- **PostgreSQL hosted through Replit:** Persist the nine application tables and their relationships.
- **Clerk with email/password:** Provide in-app sign-up/login forms and secure password handling; link each account to an application `users` row through `auth_id`.
- **Replit hosting:** Provide the live app URL for submission and user testing.
- **Recharts:** Display activity and progress charts using server-calculated data.
- **Vitest and Supertest:** Test dashboard calculations and data isolation through server requests.
- **GitHub:** Store code, Issues, branches, PRs, and prompt logs as the assignment's development record.

## 6. Design

Dark charcoal backgrounds, white text, and lime-green accents for primary actions and chart highlights. Use large, phone-friendly inputs and clear exercise cards for logging at the gym. Borrow workout-log layout ideas from Hevy and straightforward set entry from Strong without copying their branding. Label charts and controls clearly; never rely on color alone to communicate meaning.

## 7. Risks and cuts

The exercise- and workout-specific progress charts are the biggest implementation risk: grouping records across dates, calculating volume, and handling template edits correctly. Use stable exercise/workout IDs, immutable template versions, and saved session data, then compare chart results with a small dataset checked by hand. During the template feature's verification, edit a template to remove an exercise and confirm that the earlier version, logged sets, and exercise progress remain accessible.

Simplify visual polish first if time is short. If a functional cut is still necessary, defer the workout-volume progress chart while retaining exercise progress, the required sessions-per-week chart, and summary stats. Record any actual cut honestly below. Protect the seven required features, three extras, both tests, and required evidence rather than sacrificing them for chart polish.

## 8. Plan vs. Reality — complete after building

Preserve the original plan above. After implementation, add actual outcomes and explanations here; do not invent results in advance.

| Planned feature | Shipped / Changed / Cut | Status (Done / Backlogged) | Learning | What changed and why |
|---|---|---|---|---|

