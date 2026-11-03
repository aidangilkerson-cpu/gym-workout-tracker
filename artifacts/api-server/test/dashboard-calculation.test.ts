import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, expect, it, vi } from "vitest";
import { getTableName, sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  db, pool, usersTable, exercisesTable, workoutsTable, workoutVersionsTable,
  workoutVersionExercisesTable, sessionsTable, sessionExercisesTable, setsTable, starsTable,
} from "@workspace/db";
import { createSessionsRouter } from "../src/routes/sessions";
import { createDashboardRouter } from "../src/routes/dashboard";

// Same test-only identity boundary as Test A; never enabled in the application.
const identities = vi.hoisted(() => new Map<string, { id: string; authId: string; email: string }>());
vi.mock("../src/lib/application-account", () => ({
  getApplicationAccount: async (req: express.Request, res: express.Response) => {
    res.setHeader("Cache-Control", "no-store");
    const identity = identities.get(req.get("x-test-account") ?? "");
    if (identity) return identity;
    res.status(401).json({ error: "Please sign in." });
    return null;
  },
}));

if (process.env.NODE_ENV === "production") throw new Error("Never run fixture tests in production.");
afterAll(async () => { await pool.end(); });

it("Test B: two three-set sessions produce 2 sessions, 6 sets, and 54 total reps", async () => {
  const rollback = new Error("Rollback Test B temporary tables and fixtures");
  try {
    await db.transaction(async (tx) => {
      // Keep both reads and writes private, including all nested relations and IDs.
      const tables = [
        usersTable, exercisesTable, workoutsTable, workoutVersionsTable,
        workoutVersionExercisesTable, sessionsTable, sessionExercisesTable, setsTable, starsTable,
      ];
      for (const table of tables) {
        const name = getTableName(table);
        await tx.execute(sql`CREATE TEMP TABLE ${sql.identifier(name)}
          (LIKE public.${sql.identifier(name)} INCLUDING ALL) ON COMMIT DROP`);
        if (table !== usersTable) {
          const sequence = `test_b_${name}_id`;
          await tx.execute(sql`CREATE TEMP SEQUENCE ${sql.identifier(sequence)}`);
          // Fixed schema metadata only: PostgreSQL DDL defaults cannot bind values.
          await tx.execute(sql`ALTER TABLE pg_temp.${sql.identifier(name)}
            ALTER COLUMN id SET DEFAULT nextval(${sql.raw(`'pg_temp.${sequence}'`)}::regclass)`);
        }
      }
      for (const table of tables) {
        for (const key of getTableConfig(table).foreignKeys) {
          const { columns, foreignTable, foreignColumns } = key.reference();
          await tx.execute(sql`ALTER TABLE pg_temp.${sql.identifier(getTableName(table))}
            ADD FOREIGN KEY (${sql.join(columns.map(c => sql.identifier(c.name)), sql`, `)})
            REFERENCES pg_temp.${sql.identifier(getTableName(foreignTable))}
            (${sql.join(foreignColumns.map(c => sql.identifier(c.name)), sql`, `)})
            ON DELETE ${sql.raw(key.onDelete ?? "no action")}
            ON UPDATE ${sql.raw(key.onUpdate ?? "no action")}`);
        }
      }
      await tx.execute(sql`SET LOCAL search_path TO pg_temp, public`);
      const id = randomUUID();
      const account = { id, authId: `test-b-${id}`, email: `test-b-${id}@example.invalid` };
      await tx.insert(usersTable).values(account);
      identities.set(id, account);
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        req.log = { error: vi.fn() } as unknown as typeof req.log;
        next();
      });
      app.use("/api", createSessionsRouter(tx));
      app.use("/api", createDashboardRouter(tx));

      // GIVEN: verify actual saved sessions, not a mocked dashboard response.
      for (const [index, reps] of [[10, 8, 6], [12, 10, 8]].entries()) {
        await request(app).post("/api/sessions").set("x-test-account", id).send({
          workoutName: "Test B workout", date: `2026-11-0${index + 1}`, notes: null,
          exercises: [{ exerciseName: "Bench press", weightLb: 135.25, sets: reps.map(reps => ({ reps })) }],
        }).expect(201);
      }
      const history = await request(app).get("/api/sessions?sort=oldest")
        .set("x-test-account", id).expect(200);
      expect(history.body).toHaveLength(2);
      expect(history.body.map((session: { exercises: { sets: { reps: number }[] }[] }) =>
        session.exercises.flatMap(exercise => exercise.sets.map(set => set.reps)),
      )).toEqual([[10, 8, 6], [12, 10, 8]]);
      expect(await tx.select({ id: setsTable.id }).from(setsTable)).toHaveLength(6);

      // WHEN: request the real dashboard summary as the sessions' owner.
      const summary = await request(app).get("/api/dashboard").set("x-test-account", id).expect(200);
      // THEN: a literal, manually calculated expected answer, not the production formula.
      expect(summary.body.totalSessions).toBe(2);
      expect(summary.body.totalSets).toBe(6);
      expect(summary.body.totalReps, "Total reps must sum 10+8+6+12+10+8 = 54, not count 6 set rows").toBe(54);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    identities.clear();
  }
});
