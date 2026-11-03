import { randomUUID } from "node:crypto";
import express, { type Express } from "express";
import request from "supertest";
import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  db, pool, usersTable, exercisesTable, sessionsTable, sessionExercisesTable,
  setsTable, starsTable, workoutsTable, workoutVersionsTable,
} from "@workspace/db";
import { createSessionsRouter } from "../src/routes/sessions";

// Only provider identity is mocked. Routing, validation, authorization queries,
// nested transactions and PostgreSQL relationships are real. This code is never
// imported by the application or enabled by a request header in production.
const auth = vi.hoisted(() => ({
  accounts: new Map<string, { id: string; authId: string; email: string }>(),
}));
vi.mock("../src/lib/application-account", () => ({
  getApplicationAccount: async (req: express.Request, res: express.Response) => {
    res.setHeader("Cache-Control", "no-store");
    const account = auth.accounts.get(req.get("x-test-account") ?? "");
    if (account) return account;
    res.status(401).json({ error: "Please sign in." });
    return null;
  },
}));

if (process.env.NODE_ENV === "production") {
  throw new Error("Fixture tests must never run against production.");
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Fixture = { app: Express; tx: Transaction; a: string; b: string };
const rollback = new Error("Rollback test fixtures");

async function fixture(check: (data: Fixture) => Promise<void>) {
  try {
    await db.transaction(async (tx) => {
      const [a, b] = [randomUUID(), randomUUID()];
      const accounts = [a, b].map((id) => ({
        id, authId: `fixture-${id}`, email: `fixture-${id}@example.invalid`,
      }));
      await tx.insert(usersTable).values(accounts);
      for (const account of accounts) auth.accounts.set(account.id, account);
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        req.log = { error: vi.fn() } as unknown as typeof req.log;
        next();
      });
      app.use("/api", createSessionsRouter(tx));
      await check({ app, tx, a, b });
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    auth.accounts.clear();
  }
}

const input = () => ({
  workoutName: "Private upper-body session",
  date: "2026-11-02",
  notes: "Only visible to its owner",
  exercises: [{
    exerciseName: "Bench press", weightLb: 135.25,
    sets: [{ reps: 10 }, { reps: 10 }, { reps: 10 }],
  }],
});

async function create(app: Express, user: string, data = input()) {
  const response = await request(app).post("/api/sessions")
    .set("x-test-account", user).send(data).expect(201);
  return response.body;
}

afterAll(async () => { await pool.end(); });

describe("Session API with real PostgreSQL (fixtures always rolled back)", () => {
  it("creates, lists, reads and updates a persisted session with decimal pounds and a calendar date", async () => {
    await fixture(async ({ app, tx, a }) => {
      const saved = await create(app, a);
      expect(saved.date).toBe("2026-11-02");
      expect(saved.exercises[0].weightLb).toBe(135.25);
      expect(saved.exercises[0].sets.map((set: { reps: number }) => set.reps)).toEqual([10, 10, 10]);
      const changed = {
        ...input(), workoutName: "Updated upper-body session", date: "2026-11-03", notes: null,
        exercises: [{
          exerciseId: saved.exercises[0].exerciseId, exerciseName: "Bench press",
          weightLb: 140.5, sets: [{ reps: 8 }, { reps: 8 }],
        }],
      };
      await request(app).put(`/api/sessions/${saved.id}`).set("x-test-account", a)
        .send(changed).expect(200);
      const reloaded = await request(app).get(`/api/sessions/${saved.id}`)
        .set("x-test-account", a).expect(200);
      expect(reloaded.body).toMatchObject({
        id: saved.id, workoutName: changed.workoutName, date: changed.date, notes: null,
      });
      expect(reloaded.body.exercises[0]).toMatchObject({
        exerciseId: saved.exercises[0].exerciseId, weightLb: 140.5,
      });
      expect(reloaded.body.exercises[0].sets.map((set: { reps: number }) => set.reps)).toEqual([8, 8]);
      const list = await request(app).get("/api/sessions").set("x-test-account", a).expect(200);
      expect(list.body[0]).toEqual(reloaded.body);
      const [stored] = await tx.select().from(sessionsTable).where(eq(sessionsTable.id, saved.id));
      expect(stored.workoutName).toBe(changed.workoutName);
      expect(stored.userId).toBe(a);
      expect(reloaded.body).not.toHaveProperty("userId");
    });
  });

  it("requires sign-in for every session endpoint", async () => {
    await fixture(async ({ app }) => {
      await request(app).get("/api/sessions").expect(401);
      await request(app).post("/api/sessions").send(input()).expect(401);
      await request(app).get("/api/sessions/1").expect(401);
      await request(app).put("/api/sessions/1").send(input()).expect(401);
      await request(app).delete("/api/sessions/1").expect(401);
    });
  });

  it("denies another account's direct read, edit and delete without changing the owner's data", async () => {
    await fixture(async ({ app, a, b }) => {
      const saved = await create(app, a);
      await request(app).get(`/api/sessions/${saved.id}`).set("x-test-account", b).expect(404);
      await request(app).put(`/api/sessions/${saved.id}`).set("x-test-account", b)
        .send({ ...input(), workoutName: "Not authorized" }).expect(404);
      await request(app).delete(`/api/sessions/${saved.id}`).set("x-test-account", b).expect(404);
      const own = await request(app).get(`/api/sessions/${saved.id}`).set("x-test-account", a).expect(200);
      expect(own.body).toEqual(saved);
    });
  });

  it("rejects cross-account exercise links and rolls back a partially replaced session", async () => {
    await fixture(async ({ app, tx, a, b }) => {
      const own = await create(app, a);
      const other = await create(app, b);
      const bad = {
        ...input(), workoutName: "Must not replace the original",
        exercises: [
          { exerciseName: "Rollback-only exercise", weightLb: 25, sets: [{ reps: 4 }] },
          { exerciseId: other.exercises[0].exerciseId, exerciseName: "Foreign entry", weightLb: 10, sets: [{ reps: 1 }] },
        ],
      };
      await request(app).put(`/api/sessions/${own.id}`).set("x-test-account", a).send(bad).expect(404);
      const unchanged = await request(app).get(`/api/sessions/${own.id}`).set("x-test-account", a).expect(200);
      expect(unchanged.body).toEqual(own);
      await request(app).post("/api/sessions").set("x-test-account", a).send(bad).expect(404);
      const list = await request(app).get("/api/sessions").set("x-test-account", a).expect(200);
      expect(list.body).toHaveLength(1);
      expect(await tx.select().from(exercisesTable).where(eq(exercisesTable.name, "Rollback-only exercise"))).toEqual([]);
    });
  });

  it("deletes only the selected session's children and stars, retaining other sessions and template history", async () => {
    await fixture(async ({ app, tx, a }) => {
      const first = await create(app, a);
      const second = await create(app, a);
      const [workout] = await tx.insert(workoutsTable).values({ userId: a, name: "History" }).returning();
      const [version] = await tx.insert(workoutVersionsTable).values({
        workoutId: workout.id, versionNumber: 1, workoutName: "History",
      }).returning();
      await tx.update(sessionsTable).set({ workoutVersionId: version.id }).where(eq(sessionsTable.id, first.id));
      await tx.insert(starsTable).values({ userId: a, sessionId: first.id });
      await request(app).delete(`/api/sessions/${first.id}`).set("x-test-account", a).expect(204);
      await request(app).get(`/api/sessions/${first.id}`).set("x-test-account", a).expect(404);
      const remaining = await request(app).get(`/api/sessions/${second.id}`).set("x-test-account", a).expect(200);
      expect(remaining.body).toEqual(second);
      expect(await tx.select().from(sessionExercisesTable).where(eq(sessionExercisesTable.sessionId, first.id))).toEqual([]);
      expect(await tx.select().from(setsTable).where(eq(setsTable.sessionExerciseId, first.exercises[0].id))).toEqual([]);
      expect(await tx.select().from(starsTable).where(eq(starsTable.sessionId, first.id))).toEqual([]);
      expect(await tx.select().from(exercisesTable).where(eq(exercisesTable.id, first.exercises[0].exerciseId))).toHaveLength(1);
      expect(await tx.select().from(workoutVersionsTable).where(eq(workoutVersionsTable.id, version.id))).toHaveLength(1);
    });
  });

  it("preserves an existing version link and unequal saved reps when session metadata is edited", async () => {
    await fixture(async ({ app, tx, a }) => {
      const data = { ...input(), exercises: [{ ...input().exercises[0], sets: [{ reps: 10 }, { reps: 8 }, { reps: 6 }] }] };
      const saved = await create(app, a, data);
      const [workout] = await tx.insert(workoutsTable).values({ userId: a, name: "Original template" }).returning();
      const [version] = await tx.insert(workoutVersionsTable).values({
        workoutId: workout.id, versionNumber: 1, workoutName: "Original template",
      }).returning();
      await tx.update(sessionsTable).set({ workoutVersionId: version.id }).where(eq(sessionsTable.id, saved.id));
      const updated = await request(app).put(`/api/sessions/${saved.id}`).set("x-test-account", a)
        .send({ ...data, notes: "New notes only" }).expect(200);
      expect(updated.body.workoutVersionId).toBe(version.id);
      expect(updated.body.exercises[0].sets.map((set: { reps: number }) => set.reps)).toEqual([10, 8, 6]);
    });
  });

  it("returns actionable field errors and does not overwrite a saved session after an invalid edit", async () => {
    await fixture(async ({ app, a }) => {
      const saved = await create(app, a);
      const invalid = {
        ...input(), workoutName: " ", date: "2026-02-30",
        exercises: [{ exerciseName: " ", weightLb: -1, sets: [{ reps: 1.5 }] }],
      };
      const result = await request(app).put(`/api/sessions/${saved.id}`)
        .set("x-test-account", a).send(invalid).expect(400);
      expect(result.body.error).toBe("Check the highlighted fields before saving.");
      for (const path of ["workoutName", "date", "exercises.0.exerciseName", "exercises.0.weightLb", "exercises.0.sets.0.reps"]) {
        expect(result.body.fieldErrors[path]).toEqual(expect.any(String));
      }
      const reloaded = await request(app).get(`/api/sessions/${saved.id}`)
        .set("x-test-account", a).expect(200);
      expect(reloaded.body).toEqual(saved);
      await request(app).post("/api/sessions").set("x-test-account", a).send(invalid).expect(400);
      expect((await request(app).get("/api/sessions").set("x-test-account", a).expect(200)).body).toHaveLength(1);

      const corrected = { ...input(), exercises: [{ exerciseName: "Unweighted exercise", weightLb: 0, sets: [{ reps: 0 }] }] };
      const updated = await request(app).put(`/api/sessions/${saved.id}`)
        .set("x-test-account", a).send(corrected).expect(200);
      expect(updated.body.exercises[0]).toMatchObject({ weightLb: 0, sets: [{ reps: 0 }] });
    });
  });

  it("explains invalid precision, ranges, required arrays, and text limits on direct requests", async () => {
    await fixture(async ({ app, a }) => {
      const cases: [object, string][] = [
        [{ ...input(), workoutName: "a".repeat(121) }, "workoutName"],
        [{ ...input(), notes: "a".repeat(5001) }, "notes"],
        [{ ...input(), date: "0000-01-01" }, "date"],
        [{ ...input(), exercises: [] }, "exercises"],
        [{ ...input(), exercises: [{ ...input().exercises[0], weightLb: 135.251 }] }, "exercises.0.weightLb"],
        [{ ...input(), exercises: [{ ...input().exercises[0], weightLb: 100000000 }] }, "exercises.0.weightLb"],
        [{ ...input(), exercises: [{ ...input().exercises[0], sets: [] }] }, "exercises.0.sets"],
        [{ ...input(), exercises: [{ ...input().exercises[0], sets: Array.from({ length: 101 }, () => ({ reps: 8 })) }] }, "exercises.0.sets"],
        [{ ...input(), exercises: [{ ...input().exercises[0], sets: [{ reps: 2147483648 }] }] }, "exercises.0.sets.0.reps"],
      ];
      for (const [data, path] of cases) {
        const result = await request(app).post("/api/sessions")
          .set("x-test-account", a).send(data).expect(400);
        expect(result.body.fieldErrors[path]).toEqual(expect.any(String));
        expect(result.body.stack).toBeUndefined();
      }
      const valid = { ...input(), date: "2024-02-29" };
      const created = await create(app, a, valid);
      expect(created.exercises[0].weightLb).toBe(135.25);
      expect(created.date).toBe("2024-02-29");
    });
  });

  it("rejects invalid writes and ignores attempts to assign the owner or version from request input", async () => {
    await fixture(async ({ app, a, b }) => {
      for (const data of [
        { ...input(), workoutName: " " },
        { ...input(), date: "2026-02-30" },
        { ...input(), date: "0000-01-01" },
        { ...input(), exercises: [] },
        { ...input(), exercises: [{ ...input().exercises[0], weightLb: -1 }] },
        { ...input(), exercises: [{ ...input().exercises[0], sets: [{ reps: 1.5 }] }] },
      ]) {
        await request(app).post("/api/sessions").set("x-test-account", a).send(data).expect(400);
      }
      const saved = await create(app, a, { ...input(), userId: b, workoutVersionId: 123 } as ReturnType<typeof input>);
      expect(saved.workoutVersionId).toBeNull();
      expect((await request(app).get("/api/sessions").set("x-test-account", b).expect(200)).body).toEqual([]);
      await request(app).get("/api/sessions/1.5").set("x-test-account", a).expect(404);
      await request(app).get("/api/sessions/not-an-id").set("x-test-account", a).expect(404);
    });
  });
});
