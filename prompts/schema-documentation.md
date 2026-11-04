# Database schema — documentation log

## Approved scope

Documentation Issue #33: write root schema.md describing every application table, column, and relationship, then compare the actual model with section 3 of the original PLAN.md. No database or application changes; README.md remains a later step.

## Requirement and approval excerpts

- “List every table, its columns, and how the tables relate, in plain English or a simple diagram.”
- “Compare it with section 3 of your plan: did the agent build what you designed?”
- Branch approval: “Create schema branch”
- Implementation approval: “Write schema documentation”

## Source review and decisions

- Read all nine Drizzle table definitions, including their actual PostgreSQL column names, types, nullable fields, defaults, keys, indexes, and checks.
- Documented sessions as the main logged item, exercises/sets as related records, and stars as the shared users-to-items junction.
- Distinguished database constraints from application rules: foreign keys alone do not enforce ownership of every linked record; note length and immutable-version behavior also rely on the application.
- Explained same-owner stars through their composite foreign key, session deletion cascades, and restricted deletion of referenced history.
- Compared the preserved original model with concrete implementation details. Identified per-exercise notes as the later product-level schema addition rather than pretending they were in the original plan.
- Updated the current scope sentence in replit.md; left PLAN.md, README.md, models, application code, and test code untouched.

## Verification

- Checked each table and column against the Drizzle definitions, including required/optional status, foreign-key targets, and unique/check constraints.
- Checked the nine-table count, complete column coverage, and documentation-only changed-file scope.
- Ran git diff --check. No database queries, migrations, writes, app tests, or browser runs were required or claimed for this documentation-only change.

## Delivery boundary

Commit and push after verification, then stop for approval before opening a linked PR. Student review/merge remains student-controlled. Do not begin README.md in this step.
