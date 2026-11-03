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

// Test-only identity boundary. Never imported by the running application.
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

it("Test A: User B opens history and cannot see User A's saved session", async () => {
  const rollback = new Error("Rollback Test A temporary tables and fixtures");
  try {
    await db.transaction(async (tx) => {
      // Real PostgreSQL tables, isolated even when the owner filter is removed.
      // LIKE copies types/checks/indexes; recreate FKs and local serial defaults too.
      const tables = [
        usersTable, exercisesTable, workoutsTable, workoutVersionsTable,
        workoutVersionExercisesTable, sessionsTable, sessionExercisesTable, setsTable, starsTable,
      ];
      for (const table of tables) {
        const name = getTableName(table);
        await tx.execute(sql`CREATE TEMP TABLE ${sql.identifier(name)}
          (LIKE public.${sql.identifier(name)} INCLUDING ALL) ON COMMIT DROP`);
        if (table !== usersTable) {
          const sequence = `test_a_${name}_id`;
          await tx.execute(sql`CREATE TEMP SEQUENCE ${sql.identifier(sequence)}`);
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
      const [a, b] = [randomUUID(), randomUUID()];
      const accounts = [a, b].map(id => ({
        id, authId: `test-a-${id}`, email: `test-a-${id}@example.invalid`,
      }));
      await tx.insert(usersTable).values(accounts);
      accounts.forEach(account => identities.set(account.id, account));
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        req.log = { error: vi.fn() } as unknown as typeof req.log;
        next();
      });
      app.use("/api", createSessionsRouter(tx));

      // GIVEN: A really has a saved result; B has no sessions.
      const saved = await request(app).post("/api/sessions").set("x-test-account", a).send({
        workoutName: "User A private workout", date: "2026-11-02",
        notes: "Private fixture note",
        exercises: [{ exerciseName: "Bench press", weightLb: 135.25, sets: [{ reps: 10 }, { reps: 8 }, { reps: 6 }] }],
      }).expect(201);
      const aHistory = await request(app).get("/api/sessions").set("x-test-account", a).expect(200);
      expect(aHistory.body).toHaveLength(1);
      expect(aHistory.body[0]).toMatchObject({
        id: saved.body.id, workoutName: "User A private workout",
        exercises: [{ exerciseName: "Bench press", weightLb: 135.25, sets: [{ reps: 10 }, { reps: 8 }, { reps: 6 }] }],
      });
      expect(await tx.select({ id: sessionsTable.id }).from(sessionsTable)).toHaveLength(1);

      // WHEN: the history request is authenticated as B (no knowledge of A's ID).
      const bHistory = await request(app).get("/api/sessions").set("x-test-account", b).expect(200);
      // THEN: no session, exercise, note, weight or rep belonging to A is exposed.
      expect(bHistory.body, "User B's history must be empty; User A's private session must not leak").toEqual([]);
      expect(JSON.stringify(bHistory.body)).not.toContain("User A private workout");
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    identities.clear();
  }
});
