import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

// Development-only integration test. Every fixture is inside one transaction
// which is rolled back, including when a check fails. Never use a production URL.
const expectedColumns = {
  users: ["id", "auth_id", "email"],
  exercises: ["id", "user_id", "name", "archived"],
  workouts: ["id", "user_id", "name", "archived"],
  workout_versions: ["id", "workout_id", "version_number", "workout_name", "saved_at"],
  workout_version_exercises: ["id", "workout_version_id", "exercise_id", "exercise_name", "position"],
  sessions: ["id", "user_id", "workout_version_id", "workout_name", "date", "notes"],
  session_exercises: ["id", "session_id", "exercise_id", "exercise_name", "weight_lb", "position"],
  sets: ["id", "session_exercise_id", "set_number", "reps"],
  stars: ["id", "user_id", "session_id"],
};

test("development workout schema preserves relationships and history", { timeout: 30_000 }, async (t) => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for the development schema test");
  assert.notEqual(process.env.NODE_ENV, "production", "Do not run fixture tests in production");
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  const userA = `schema-test-${randomUUID()}`;
  const userB = `schema-test-${randomUUID()}`;
  let began = false;
  const row = async (sql, params = []) => (await client.query(sql, params)).rows[0];

  // Expected failures must not leave the surrounding transaction aborted.
  async function rejectsConstraint(sql, params, code) {
    await client.query("SAVEPOINT constraint_probe");
    try {
      await assert.rejects(() => client.query(sql, params), (error) => error.code === code);
    } finally {
      await client.query("ROLLBACK TO SAVEPOINT constraint_probe");
      await client.query("RELEASE SAVEPOINT constraint_probe");
    }
  }

  try {
    await client.connect();
    await client.query("BEGIN");
    began = true;
    await client.query("SET LOCAL statement_timeout = '5s'");
    await client.query("SET LOCAL TIME ZONE 'Pacific/Honolulu'");

    await t.test("all nine tables have the planned columns, primary keys, and foreign keys", async () => {
      const names = Object.keys(expectedColumns);
      const columns = (await client.query(
        `SELECT table_name, column_name, data_type, numeric_scale, is_nullable
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = ANY($1::text[])
         ORDER BY table_name, ordinal_position`, [names],
      )).rows;
      for (const [table, expected] of Object.entries(expectedColumns)) {
        assert.deepEqual(columns.filter((c) => c.table_name === table).map((c) => c.column_name), expected);
      }
      const primaryKeys = await row(
        `SELECT count(*)::int AS count FROM information_schema.table_constraints
         WHERE table_schema = 'public' AND table_name = ANY($1::text[])
         AND constraint_type = 'PRIMARY KEY'`, [names],
      );
      assert.equal(primaryKeys.count, 9);
      const foreignKeys = await row(
        `SELECT count(*)::int AS count FROM information_schema.table_constraints
         WHERE table_schema = 'public' AND table_name = ANY($1::text[])
         AND constraint_type = 'FOREIGN KEY'`, [names],
      );
      assert.equal(foreignKeys.count, 12);
      const weight = columns.find((c) => c.table_name === "session_exercises" && c.column_name === "weight_lb");
      assert.equal(weight.data_type, "numeric");
      assert.equal(weight.numeric_scale, 2);
      assert.ok(!expectedColumns.sets.includes("weight_lb"), "weight belongs to the exercise, not each set");
      assert.equal(columns.find((c) => c.table_name === "sessions" && c.column_name === "date").data_type, "date");
      assert.equal(columns.find((c) => c.table_name === "sessions" && c.column_name === "workout_version_id").is_nullable, "YES");
    });

    for (const id of [userA, userB]) {
      await client.query("INSERT INTO users (id, auth_id, email) VALUES ($1, $2, $3)", [
        id, `auth-${id}`, "schema-test@example.invalid",
      ]);
    }
    const press = await row("INSERT INTO exercises (user_id, name) VALUES ($1, $2) RETURNING *", [userA, "Press"]);
    const pull = await row("INSERT INTO exercises (user_id, name) VALUES ($1, $2) RETURNING *", [userA, "Row"]);
    const workout = await row("INSERT INTO workouts (user_id, name) VALUES ($1, $2) RETURNING *", [userA, "Upper body"]);
    const version1 = await row(
      "INSERT INTO workout_versions (workout_id, version_number, workout_name) VALUES ($1, 1, $2) RETURNING *",
      [workout.id, workout.name],
    );
    await client.query(
      `INSERT INTO workout_version_exercises (workout_version_id, exercise_id, exercise_name, position)
       VALUES ($1, $2, 'Press', 0), ($1, $3, 'Row', 1)`, [version1.id, press.id, pull.id],
    );
    const session = await row(
      `INSERT INTO sessions (user_id, workout_version_id, workout_name, date)
       VALUES ($1, $2, $3, $4) RETURNING *`, [userA, version1.id, workout.name, "2026-11-02"],
    );
    const pressed = await row(
      `INSERT INTO session_exercises (session_id, exercise_id, exercise_name, weight_lb, position)
       VALUES ($1, $2, 'Press', 22.50, 0) RETURNING *`, [session.id, press.id],
    );
    const pulled = await row(
      `INSERT INTO session_exercises (session_id, exercise_id, exercise_name, weight_lb, position)
       VALUES ($1, $2, 'Row', 30, 1) RETURNING *`, [session.id, pull.id],
    );
    await client.query(
      `INSERT INTO sets (session_exercise_id, set_number, reps)
       VALUES ($1, 1, 10), ($1, 2, 8), ($1, 3, 6), ($2, 1, 12)`, [pressed.id, pulled.id],
    );

    await t.test("decimal exercise weight, different reps per set, and calendar dates are retained", async () => {
      assert.equal((await row("SELECT weight_lb::text AS weight FROM session_exercises WHERE id = $1", [pressed.id])).weight, "22.50");
      assert.deepEqual(
        (await client.query("SELECT reps FROM sets WHERE session_exercise_id = $1 ORDER BY set_number", [pressed.id])).rows.map((s) => s.reps),
        [10, 8, 6],
      );
      assert.equal((await row("SELECT date::text AS date FROM sessions WHERE id = $1", [session.id])).date, "2026-11-02");
      assert.ok(version1.saved_at instanceof Date);
      assert.equal(press.archived, false);
      assert.equal(workout.archived, false);
    });

    await t.test("a new version and archived library entries do not overwrite earlier history", async () => {
      const version2 = await row(
        "INSERT INTO workout_versions (workout_id, version_number, workout_name) VALUES ($1, 2, $2) RETURNING *",
        [workout.id, "Press day"],
      );
      await client.query(
        `INSERT INTO workout_version_exercises (workout_version_id, exercise_id, exercise_name, position)
         VALUES ($1, $2, 'Press', 0)`, [version2.id, press.id],
      );
      await client.query("UPDATE workouts SET name = 'Press day', archived = true WHERE id = $1", [workout.id]);
      await client.query("UPDATE exercises SET name = 'Seated row', archived = true WHERE id = $1", [pull.id]);
      const old = await row("SELECT * FROM workout_versions WHERE id = $1", [version1.id]);
      assert.equal(old.workout_name, "Upper body");
      assert.equal(old.version_number, 1);
      assert.deepEqual(
        (await client.query(
          "SELECT exercise_name FROM workout_version_exercises WHERE workout_version_id = $1 ORDER BY position",
          [version1.id],
        )).rows.map((e) => e.exercise_name), ["Press", "Row"],
      );
      assert.equal((await row(
        "SELECT count(*)::int AS count FROM workout_version_exercises WHERE workout_version_id = $1", [version2.id],
      )).count, 1);
      const history = await row(
        `SELECT s.workout_name, s.workout_version_id, e.exercise_name, e.weight_lb::text AS weight, st.reps
         FROM sessions s JOIN session_exercises e ON e.session_id = s.id
         JOIN sets st ON st.session_exercise_id = e.id
         WHERE s.id = $1 AND e.exercise_id = $2`, [session.id, pull.id],
      );
      assert.deepEqual(history, {
        workout_name: "Upper body", workout_version_id: version1.id,
        exercise_name: "Row", weight: "30.00", reps: 12,
      });
    });

    await t.test("duplicate version numbers, positions, set numbers, and stars are rejected", async () => {
      await rejectsConstraint(
        "INSERT INTO workout_versions (workout_id, version_number, workout_name) VALUES ($1, 1, 'Duplicate')",
        [workout.id], "23505",
      );
      await rejectsConstraint(
        `INSERT INTO workout_version_exercises (workout_version_id, exercise_id, exercise_name, position)
         VALUES ($1, $2, 'Duplicate', 0)`, [version1.id, press.id], "23505",
      );
      await rejectsConstraint(
        `INSERT INTO session_exercises (session_id, exercise_id, exercise_name, weight_lb, position)
         VALUES ($1, $2, 'Duplicate', 10, 0)`, [session.id, press.id], "23505",
      );
      await rejectsConstraint(
        "INSERT INTO sets (session_exercise_id, set_number, reps) VALUES ($1, 1, 5)", [pressed.id], "23505",
      );
      await client.query("INSERT INTO stars (user_id, session_id) VALUES ($1, $2)", [userA, session.id]);
      await rejectsConstraint("INSERT INTO stars (user_id, session_id) VALUES ($1, $2)", [userA, session.id], "23505");
    });

    await t.test("required fields, numeric bounds, and invalid parent links are rejected", async () => {
      await rejectsConstraint("INSERT INTO exercises (user_id, name) VALUES ($1, NULL)", [userA], "23502");
      await rejectsConstraint(
        "INSERT INTO exercises (user_id, name) VALUES ($1, 'Orphan')", [`missing-${userA}`], "23503",
      );
      await rejectsConstraint(
        `INSERT INTO session_exercises (session_id, exercise_id, exercise_name, weight_lb, position)
         VALUES ($1, -1, 'Orphan', 1, 2)`, [session.id], "23503",
      );
      await rejectsConstraint(
        `INSERT INTO session_exercises (session_id, exercise_id, exercise_name, weight_lb, position)
         VALUES ($1, $2, 'Invalid', -1, 2)`, [session.id, press.id], "23514",
      );
      await rejectsConstraint(
        `INSERT INTO session_exercises (session_id, exercise_id, exercise_name, weight_lb, position)
         VALUES ($1, $2, 'Invalid', 'NaN', 2)`, [session.id, press.id], "23514",
      );
      await rejectsConstraint(
        "INSERT INTO sets (session_exercise_id, set_number, reps) VALUES ($1, 4, -1)", [pressed.id], "23514",
      );
      await rejectsConstraint(
        "INSERT INTO sets (session_exercise_id, set_number, reps) VALUES ($1, 4, $2)", [pressed.id, "2.5"], "22P02",
      );
      await rejectsConstraint(
        "INSERT INTO sets (session_exercise_id, set_number, reps) VALUES ($1, 0, 5)", [pressed.id], "23514",
      );
      await rejectsConstraint(
        "INSERT INTO workout_versions (workout_id, version_number, workout_name) VALUES ($1, 0, 'Invalid')",
        [workout.id], "23514",
      );
    });

    await t.test("a user cannot star another user's session and referenced history cannot be deleted", async () => {
      await rejectsConstraint("INSERT INTO stars (user_id, session_id) VALUES ($1, $2)", [userB, session.id], "23503");
      await rejectsConstraint("DELETE FROM workouts WHERE id = $1", [workout.id], "23503");
      await rejectsConstraint("DELETE FROM workout_versions WHERE id = $1", [version1.id], "23503");
      await rejectsConstraint("DELETE FROM exercises WHERE id = $1", [pull.id], "23503");
    });

    await t.test("template-free sessions are allowed and explicit session deletion removes only their dependent rows", async () => {
      const scratch = await row(
        "INSERT INTO sessions (user_id, workout_name, date) VALUES ($1, 'Unplanned', '2026-11-03') RETURNING *", [userA],
      );
      assert.equal(scratch.workout_version_id, null);
      assert.equal(scratch.notes, null);
      const entry = await row(
        `INSERT INTO session_exercises (session_id, exercise_id, exercise_name, weight_lb, position)
         VALUES ($1, $2, 'Press', 0, 0) RETURNING *`, [scratch.id, press.id],
      );
      await client.query("INSERT INTO sets (session_exercise_id, set_number, reps) VALUES ($1, 1, 0)", [entry.id]);
      await client.query("INSERT INTO stars (user_id, session_id) VALUES ($1, $2)", [userA, scratch.id]);
      await client.query("DELETE FROM sessions WHERE id = $1", [scratch.id]);
      assert.equal((await row("SELECT count(*)::int AS count FROM session_exercises WHERE session_id = $1", [scratch.id])).count, 0);
      assert.equal((await row("SELECT count(*)::int AS count FROM sets WHERE session_exercise_id = $1", [entry.id])).count, 0);
      assert.equal((await row("SELECT count(*)::int AS count FROM stars WHERE session_id = $1", [scratch.id])).count, 0);
      assert.equal((await row("SELECT count(*)::int AS count FROM workout_versions WHERE workout_id = $1", [workout.id])).count, 2);
      assert.equal((await row("SELECT count(*)::int AS count FROM sessions WHERE id = $1", [session.id])).count, 1);
    });
  } finally {
    try {
      if (began) {
        await client.query("ROLLBACK");
        const remaining = await row("SELECT count(*)::int AS count FROM users WHERE id = ANY($1::text[])", [[userA, userB]]);
        assert.equal(remaining.count, 0, "test fixture users must not remain after rollback");
      }
    } finally {
      await client.end();
    }
  }
});
