# LiftLedgr database schema

LiftLedgr uses PostgreSQL, with models defined in `lib/db/src/schema/` through Drizzle ORM. This document describes the nine application tables in those models. Clerk manages authentication separately; passwords are not stored in these tables.

**Notation:** PK = primary key (identifies one row); FK = foreign key (links to another row). All columns are required unless marked **optional**. A `serial` column is an automatically generated integer. Column names below are the actual database names.

## 1. `users` — application accounts

| Column | PostgreSQL type | Meaning and rules |
|---|---|---|
| `id` | `text` | PK; application account ID. |
| `auth_id` | `text` | Unique Clerk identity ID; connects a signed-in identity to this account. |
| `email` | `text` | Account email; not declared unique in this schema. |

## 2. `exercises` — each user's exercise library

| Column | PostgreSQL type | Meaning and rules |
|---|---|---|
| `id` | `serial` | PK. |
| `user_id` | `text` | FK → `users.id`; exercise owner. |
| `name` | `text` | Exercise name. |
| `archived` | `boolean` | Defaults to `false`; hides retired choices without deleting history. |

The owner column is indexed. Names are not database-unique; history uses exercise IDs, not names, as identity.

## 3. `workouts` — reusable workout templates

| Column | PostgreSQL type | Meaning and rules |
|---|---|---|
| `id` | `serial` | PK; stable workout identity across versions. |
| `user_id` | `text` | FK → `users.id`; template owner. |
| `name` | `text` | Current workout name. |
| `archived` | `boolean` | Defaults to `false`; retirement preserves earlier versions and results. |

The owner column is indexed. Creating a workout template does not itself create a completed session.

## 4. `workout_versions` — saved template revisions

| Column | PostgreSQL type | Meaning and rules |
|---|---|---|
| `id` | `serial` | PK. |
| `workout_id` | `integer` | FK → `workouts.id`. |
| `version_number` | `integer` | Must be greater than zero. |
| `workout_name` | `text` | Snapshot of the name when this version was saved. |
| `saved_at` | `timestamp with time zone` | Defaults to the current timestamp; records when the revision was saved. |

The pair (`workout_id`, `version_number`) is unique. The application appends a new revision when a template is edited rather than overwriting the old revision.

## 5. `workout_version_exercises` — exercises in a particular revision

| Column | PostgreSQL type | Meaning and rules |
|---|---|---|
| `id` | `serial` | PK. |
| `workout_version_id` | `integer` | FK → `workout_versions.id`. |
| `exercise_id` | `integer` | FK → `exercises.id`; stable library identity. |
| `exercise_name` | `text` | Saved name snapshot for this revision. |
| `position` | `integer` | Zero-based display order; must be at least zero. |

The pair (`workout_version_id`, `position`) is unique. `exercise_id` is indexed. This junction table connects versions and exercises; the same exercise can occur in multiple versions, or more than once at different positions in a version.

## 6. `sessions` — the main logged item

| Column | PostgreSQL type | Meaning and rules |
|---|---|---|
| `id` | `serial` | PK. |
| `user_id` | `text` | FK → `users.id`; session owner. |
| `workout_version_id` | `integer` | **Optional**, FK → `workout_versions.id`; empty for an ad-hoc session. |
| `workout_name` | `text` | Saved workout name for this training occasion. |
| `date` | `date` | Workout day, without a time of day; represented as a calendar-date string in the app. |
| `notes` | `text` | **Optional** whole-session note. |

Indexes cover (`user_id`, `date`) and `workout_version_id`. The pair (`id`, `user_id`) also has a unique constraint so that stars can reference both a session and its actual owner together.

## 7. `session_exercises` — exercises actually logged in a session

| Column | PostgreSQL type | Meaning and rules |
|---|---|---|
| `id` | `serial` | PK. |
| `session_id` | `integer` | FK → `sessions.id`. |
| `exercise_id` | `integer` | FK → `exercises.id`; connects progress across workouts. |
| `exercise_name` | `text` | Name snapshot for this logged entry. |
| `weight_lb` | `numeric(10,2)` | One shared weight in pounds for this exercise's sets; nonnegative and not PostgreSQL numeric `NaN`. Supports two decimal places. |
| `position` | `integer` | Zero-based display order; must be at least zero. |
| `notes` | `text` | **Optional** note for this exercise on this occasion; separate from `sessions.notes`. |

The pair (`session_id`, `position`) is unique. `exercise_id` is indexed. An exercise can appear more than once at different positions in one session.

Exercise notes are saved with history, not in one overwriteable library field. The app looks up the latest owned note by stable exercise ID across workouts when preparing a new draft. A later cleared note remains blank rather than reviving an older note; editing later training does not rewrite an earlier session's note. The 5,000-character note limit is application validation, not a database text-length constraint.

## 8. `sets` — independently recorded repetition counts

| Column | PostgreSQL type | Meaning and rules |
|---|---|---|
| `id` | `serial` | PK. |
| `session_exercise_id` | `integer` | FK → `session_exercises.id`. |
| `set_number` | `integer` | One-based set number; must be greater than zero. |
| `reps` | `integer` | Repetitions for this set; must be at least zero. |

The pair (`session_exercise_id`, `set_number`) is unique. Weight belongs to the parent session exercise, not to each set, so reps can differ between sets while the weight stays shared.

## 9. `stars` — users' favorite sessions

| Column | PostgreSQL type | Meaning and rules |
|---|---|---|
| `id` | `serial` | PK. |
| `user_id` | `text` | FK → `users.id`; starring user. |
| `session_id` | `integer` | Part of the composite FK below; starred session. |

The pair (`user_id`, `session_id`) is unique, preventing duplicate favorites. `session_id` is indexed.

The composite FK (`session_id`, `user_id`) → `sessions` (`id`, `user_id`) ensures the starring user is also the session owner. This is one shared junction table for all users, not a separate favorites table per account. Although a junction table connects users and items, this app deliberately permits users to star only their own items.

## Relationships in plain English

- One user owns many library exercises, workout templates, sessions, and stars.
- One workout has many versions. One version has many ordered entries in `workout_version_exercises`; each entry links to one library exercise.
- One version can be used by many sessions. A session can instead be independent of any template.
- One session contains many ordered session exercises. Each links to a library exercise and contains many numbered sets.
- Stars link an account to one of that account's sessions. A session has at most one star from its owner.
- Stable workout and exercise IDs connect progress across revisions. Saved name snapshots and concrete version links preserve historical meaning even after a routine is renamed or changed.

### Deletion and ownership

Deleting a session cascades to its session exercises, their sets, and its stars. Other foreign keys use restricted deletion: referenced users, exercises, workouts, and template versions cannot simply be deleted while dependent rows remain. The app archives reusable workouts and library exercises rather than deleting their historical records.

Foreign keys ensure referenced rows exist; they do not by themselves enforce ownership of every relationship. The stars composite FK specifically enforces same-owner favorites. The server must additionally authenticate requests and check ownership of sessions, linked exercises, and template versions. User IDs are not duplicated on every child row.

### Calculated values, not extra tables

Dashboard totals and charts are calculated from saved sessions, session exercises, and sets. There is no dashboard totals table. Repeating a session creates independent session/exercise/set rows rather than a permanent copy-link table. Clerk's password/session storage is outside this application schema.

## Comparison with section 3 of the original plan

| Planned design | Actual implementation | Comparison |
|---|---|---|
| Nine named application tables | The same nine tables listed above | Matched; no planned table was cut or replaced. |
| Users linked through unique `auth_id` | Text account PK, unique Clerk `auth_id`, and email | Matched; authentication remains outside application password storage. |
| Versioned templates with ordered exercise snapshots | Stable workouts, numbered/timestamped versions, and ordered junction rows | Matched; editing a routine preserves earlier versions and logged results. |
| Sessions may exist without a template | Nullable `sessions.workout_version_id` | Matched; preparing a routine and recording training remain separate actions. |
| One decimal-capable weight per exercise, integer reps per set | `numeric(10,2)` weight and individual integer rep rows | Matched; the original generic “number” was made precise. |
| Date-only session days and timestamped revisions | PostgreSQL `date` and timezone-aware revision timestamps | Matched; explicit storage types distinguish training day from save time. |
| Unique version numbers and stars | Planned pair uniqueness plus ordered-position/set-number uniqueness | Planned rules retained; additional constraints prevent duplicate positions and set numbers. |
| Ownership checks and preserved history | Server ownership checks, restricted reference deletion, session-only cascades, and same-owner star FK | Matched and strengthened with explicit database constraints and indexes. |
| Whole-session notes only | Whole-session notes retained; nullable `session_exercises.notes` added | Changed after the original features and both formal tests: the student requested editable exercise notes carried across all their workouts. No additional table was needed. |

Overall, the implementation follows the original model. The material product-level schema addition is the per-exercise note; concrete PostgreSQL types, defaults, indexes, checks, and deletion rules make the original plain-English design more precise. The original plan is preserved in `PLAN.md` rather than rewritten to include later additions.
