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
import { createDashboardRouter } from "../src/routes/dashboard";
import { createWorkoutsRouter } from "../src/routes/workouts";

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
      app.use("/api", createDashboardRouter(tx));
      app.use("/api", createWorkoutsRouter(tx));
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
  it("saves a repeated result independently without carrying its star or mutating the original", async () => {
    await fixture(async ({ app, a }) => {
      const source = await create(app, a, {
        ...input(), exercises: [{ exerciseName: "Bench", weightLb: 135.25, sets: [{ reps: 10 }, { reps: 8 }, { reps: 6 }] }],
      });
      await request(app).put(`/api/sessions/${source.id}/star`).set("x-test-account", a).send({ starred: true }).expect(200);
      const original = (await request(app).get(`/api/sessions/${source.id}`).set("x-test-account", a).expect(200)).body;
      const copy = (await request(app).post("/api/sessions").set("x-test-account", a).send({
        workoutName: original.workoutName, date: "2026-11-03", notes: null, workoutVersionId: original.workoutVersionId,
        exercises: original.exercises.map((ex: { exerciseId: number; exerciseName: string; weightLb: number; sets: { reps: number }[] }) => ({
          exerciseId: ex.exerciseId, exerciseName: ex.exerciseName, weightLb: ex.weightLb,
          sets: ex.sets.map(set => ({ reps: set.reps })),
        })),
      }).expect(201)).body;
      expect(copy.id).not.toBe(original.id);
      expect(copy.starred).toBe(false);
      expect(copy.exercises[0].id).not.toBe(original.exercises[0].id);
      const oldIds = new Set(original.exercises[0].sets.map((s: { id: number }) => s.id));
      expect(copy.exercises[0].sets.every((s: { id: number }) => !oldIds.has(s.id))).toBe(true);
      expect(copy.exercises[0].sets.map((s: { reps: number }) => s.reps)).toEqual([10, 8, 6]);
      await request(app).put(`/api/sessions/${copy.id}`).set("x-test-account", a).send({
        workoutName: copy.workoutName, date: copy.date, notes: "New session only",
        exercises: [{ exerciseId: copy.exercises[0].exerciseId, exerciseName: "Bench", weightLb: 136.25, sets: [{ reps: 0 }, { reps: 5 }] }],
      }).expect(200);
      expect((await request(app).get(`/api/sessions/${source.id}`).set("x-test-account", a).expect(200)).body).toEqual(original);
      await request(app).delete(`/api/sessions/${copy.id}`).set("x-test-account", a).expect(204);
      expect((await request(app).get(`/api/sessions/${source.id}`).set("x-test-account", a).expect(200)).body).toEqual(original);
    });
  });

  it("versions reusable workouts without logging and preserves linked session history", async () => {
    await fixture(async ({ app, a, tx }) => {
      const api = (method: "get" | "post" | "put", path: string) => request(app)[method](path).set("x-test-account", a);
      const w1 = (await api("post", "/api/workouts").send({
        name: " Upper ", exercises: [{ exerciseName: "Bench" }, { exerciseName: "Row" }],
      }).expect(201)).body;
      const v1 = w1.versions[0];
      expect(v1.versionNumber).toBe(1);
      expect(Number.isNaN(Date.parse(v1.savedAt))).toBe(false);
      expect((await api("get", "/api/sessions").expect(200)).body).toEqual([]);
      const logged = (await api("post", "/api/sessions").send({ ...input(), workoutName: "Upper", workoutVersionId: v1.id,
        exercises: [
          { exerciseId: v1.exercises[0].exerciseId, exerciseName: "Bench", weightLb: 135.25, sets: [{ reps: 7 }, { reps: 5 }] },
          { exerciseId: v1.exercises[1].exerciseId, exerciseName: "Row", weightLb: 70, sets: [{ reps: 3 }] },
        ] }).expect(201)).body;
      const w2 = (await api("put", `/api/workouts/${w1.id}`).send({
        expectedVersionId: v1.id, name: "Upper revised",
        exercises: [{ exerciseId: v1.exercises[1].exerciseId, exerciseName: "Row" }, { exerciseName: "Squat" }],
      }).expect(200)).body;
      const v2 = w2.versions[0];
      expect(w2.versions.map((v: { versionNumber: number }) => v.versionNumber)).toEqual([2, 1]);
      expect(w2.versions[1]).toEqual(v1);
      expect(v2.exercises.map((e: { exerciseName: string }) => e.exerciseName)).toEqual(["Row", "Squat"]);
      expect(v2.exercises[0].exerciseId).toBe(v1.exercises[1].exerciseId);
      expect((await api("get", `/api/sessions/${logged.id}`).expect(200)).body).toEqual(logged);
      // A draft started from v1 can finish after v2 exists, without substitution.
      await api("post", "/api/sessions").send({ ...input(), workoutVersionId: v1.id, workoutName: "Upper",
        exercises: [{ exerciseId: v1.exercises[0].exerciseId, exerciseName: "Bench", weightLb: 135.25, sets: [{ reps: 1 }] }],
      }).expect(201);
      const newer = (await api("post", "/api/sessions").send({ ...input(), workoutVersionId: v2.id, workoutName: "Upper revised",
        exercises: [
          { exerciseId: v2.exercises[0].exerciseId, exerciseName: "Row", weightLb: 70.5, sets: [{ reps: 2 }, { reps: 0 }] },
          { exerciseId: v2.exercises[1].exerciseId, exerciseName: "Squat", weightLb: 0, sets: [{ reps: 4 }] },
        ],
      }).expect(201)).body;
      expect(newer.workoutVersionId).toBe(v2.id);
      await tx.update(exercisesTable).set({ archived: true }).where(eq(exercisesTable.id, v1.exercises[0].exerciseId));
      const dash = (await api("get", `/api/dashboard?workoutKey=template:${w1.id}`).expect(200)).body;
      expect([dash.totalSessions, dash.totalSets, dash.totalReps]).toEqual([3, 7, 22]);
      expect(dash.workoutVolume.map((p: { volumeLbReps: number }) => p.volumeLbReps)).toEqual([1833, 135.25, 141]);
      expect(dash.exercises.some((e: { id: number }) => e.id === v1.exercises[0].exerciseId)).toBe(true);
      expect((await api("get", "/api/exercises").expect(200)).body.some((e: { id: number }) => e.id === v1.exercises[0].exerciseId)).toBe(false);
      const originalInput = { ...input(), workoutName: "Corrected log",
        exercises: logged.exercises.map((e: { exerciseId: number; exerciseName: string; weightLb: number; sets: { reps: number }[] }) =>
          ({ exerciseId: e.exerciseId, exerciseName: e.exerciseName, weightLb: e.weightLb, sets: e.sets.map(s => ({ reps: s.reps })) })),
      };
      const edited = (await api("put", `/api/sessions/${logged.id}`).send(originalInput).expect(200)).body;
      expect(edited.workoutVersionId).toBe(v1.id);
      await api("put", `/api/sessions/${logged.id}`).send({ ...originalInput, workoutVersionId: v2.id }).expect(409);
      expect((await api("get", `/api/sessions/${logged.id}`).expect(200)).body).toEqual(edited);
    });
  });

  it("archives idempotently without deleting versions and refuses new archived-workout sessions", async () => {
    await fixture(async ({ app, a }) => {
      const w = (await request(app).post("/api/workouts").set("x-test-account", a)
        .send({ name: "Archive check", exercises: [{ exerciseName: "Lift" }] }).expect(201)).body;
      for (let i = 0; i < 2; i++) {
        const archived = (await request(app).put(`/api/workouts/${w.id}/archive`).set("x-test-account", a).send({ archived: true }).expect(200)).body;
        expect(archived.versions).toEqual(w.versions);
      }
      expect((await request(app).get("/api/workouts").set("x-test-account", a).expect(200)).body).toEqual([]);
      expect((await request(app).get("/api/workouts?includeArchived=true").set("x-test-account", a).expect(200)).body[0].archived).toBe(true);
      await request(app).post("/api/sessions").set("x-test-account", a).send({ ...input(), workoutVersionId: w.versions[0].id }).expect(409);
      expect((await request(app).get("/api/sessions").set("x-test-account", a).expect(200)).body).toEqual([]);
      await request(app).put(`/api/workouts/${w.id}/archive`).set("x-test-account", a).send({ archived: false }).expect(200);
      expect((await request(app).get(`/api/workouts/${w.id}`).set("x-test-account", a).expect(200)).body).toEqual(w);
    });
  });

  it("rejects stale edits and rolls back failed versions without overwriting current data", async () => {
    await fixture(async ({ app, a, b, tx }) => {
      const w = (await request(app).post("/api/workouts").set("x-test-account", a)
        .send({ name: "Original", exercises: [{ exerciseName: "Keep" }] }).expect(201)).body;
      const next = { name: "Updated", expectedVersionId: w.versions[0].id, exercises: [{ exerciseName: "Keep" }] };
      const saved = (await request(app).put(`/api/workouts/${w.id}`).set("x-test-account", a).send(next).expect(200)).body;
      await request(app).put(`/api/workouts/${w.id}`).set("x-test-account", a).send(next).expect(409);
      const [foreign] = await tx.insert(exercisesTable).values({ userId: b, name: "Foreign" }).returning();
      await request(app).put(`/api/workouts/${w.id}`).set("x-test-account", a).send({
        name: "Must roll back", expectedVersionId: saved.versions[0].id, exercises: [{ exerciseId: foreign.id, exerciseName: "Foreign" }],
      }).expect(404);
      expect((await request(app).get(`/api/workouts/${w.id}`).set("x-test-account", a).expect(200)).body).toEqual(saved);
      const fail = vi.spyOn(tx.query.workoutsTable, "findFirst").mockRejectedValueOnce(new Error("Private database diagnostic"));
      try {
        const res = await request(app).get(`/api/workouts/${w.id}`).set("x-test-account", a).expect(503);
        expect(JSON.stringify(res.body)).not.toContain("diagnostic");
      } finally { fail.mockRestore(); }
      await request(app).get(`/api/workouts/${w.id}`).set("x-test-account", a).expect(200);
    });
  });

  it("validates workout input and checks every linked exercise and version owner", async () => {
    await fixture(async ({ app, a, b, tx }) => {
      await request(app).get("/api/workouts").expect(401);
      await request(app).get("/api/exercises").expect(401);
      const w = (await request(app).post("/api/workouts").set("x-test-account", a)
        .send({ name: "Owned", exercises: [{ exerciseName: "Own lift" }] }).expect(201)).body;
      await request(app).get(`/api/workouts/${w.id}`).set("x-test-account", b).expect(404);
      await request(app).put(`/api/workouts/${w.id}`).set("x-test-account", b)
        .send({ name: "Hijack", expectedVersionId: w.versions[0].id, exercises: [{ exerciseName: "No" }] }).expect(404);
      await request(app).put(`/api/workouts/${w.id}/archive`).set("x-test-account", b).send({ archived: true }).expect(404);
      await request(app).post("/api/sessions").set("x-test-account", b).send({ ...input(), workoutVersionId: w.versions[0].id }).expect(404);
      await request(app).post("/api/workouts").set("x-test-account", b).send({
        name: "Foreign exercise", exercises: [{ exerciseId: w.versions[0].exercises[0].exerciseId, exerciseName: "No" }],
      }).expect(404);
      expect((await request(app).get("/api/workouts").set("x-test-account", b).expect(200)).body).toEqual([]);
      for (const body of [
        { name: " ", exercises: [{ exerciseName: "Lift" }] }, { name: "Empty", exercises: [] },
        { name: "Blank", exercises: [{ exerciseName: " " }] },
        { name: "Bad id", exercises: [{ exerciseName: "Lift", exerciseId: 1.5 }] },
      ]) await request(app).post("/api/workouts").set("x-test-account", a).send(body).expect(400);
      for (const query of ["includeArchived=yes", "includeArchived=true&includeArchived=false", "includeArchived[x]=true"]) {
        await request(app).get(`/api/workouts?${query}`).set("x-test-account", a).expect(400);
      }
      const [archived] = await tx.insert(exercisesTable).values({ userId: a, name: "Retired", archived: true }).returning();
      await request(app).post("/api/workouts").set("x-test-account", a).send({
        name: "No new archived choice", exercises: [{ exerciseName: "Retired", exerciseId: archived.id }],
      }).expect(404);
      expect((await request(app).get("/api/workouts").set("x-test-account", a).expect(200)).body).toHaveLength(1);
    });
  });

  it("derives real dashboard history, calendar weeks and distinct exercise observations", async () => {
    await fixture(async ({ app, tx, a }) => {
      const first = await create(app, a, { ...input(), workoutName: "Routine", date: "2026-01-04",
        exercises: [{ exerciseName: "Bench", weightLb: 10.25, sets: [{ reps: 7 }, { reps: 5 }] }] });
      const second = await create(app, a, { ...input(), workoutName: "Routine", date: "2026-01-05",
        exercises: [
          { exerciseName: "Bench", weightLb: 20.1, sets: [{ reps: 4 }] },
          { exerciseName: "Bench", weightLb: 5.5, sets: [{ reps: 0 }, { reps: 2 }] },
          { exerciseName: "Row", weightLb: 2, sets: [{ reps: 3 }] },
        ] });
      await create(app, a, { ...input(), workoutName: "Other", date: "2026-01-19",
        exercises: [{ exerciseName: "Row", weightLb: 0, sets: [{ reps: 0 }] }] });
      const exerciseId = first.exercises[0].exerciseId;
      await tx.update(exercisesTable).set({ archived: true }).where(eq(exercisesTable.id, exerciseId));
      const { body } = await request(app).get("/api/dashboard").set("x-test-account", a)
        .query({ exerciseId, workoutKey: "name:Routine" }).expect(200);
      expect([body.totalSessions, body.totalSets, body.totalReps]).toEqual([3, 7, 21]);
      expect(body.weekly).toEqual([
        { weekStart: "2025-12-29", sessionCount: 1 },
        { weekStart: "2026-01-05", sessionCount: 1 },
        { weekStart: "2026-01-12", sessionCount: 0 },
        { weekStart: "2026-01-19", sessionCount: 1 },
      ]);
      expect(body.exerciseWeights.map((p: { weightLb: number }) => p.weightLb)).toEqual([10.25, 20.1, 5.5]);
      expect(body.exerciseReps.map((p: { totalReps: number }) => p.totalReps)).toEqual([12, 6]);
      expect(body.workoutVolume.map((p: { volumeLbReps: number }) => p.volumeLbReps)).toEqual([123, 97.4]);
      expect(body.exercises.find((e: { id: number }) => e.id === exerciseId)).toBeTruthy();
      expect(body.exerciseReps[1].sessionId).toBe(second.id);
      expect(body.weeklyWindowed).toBe(false);
      expect(body).not.toHaveProperty("notes");
    });
  });

  it("keeps template-linked workout history together across immutable versions", async () => {
    await fixture(async ({ app, tx, a }) => {
      const [workout] = await tx.insert(workoutsTable).values({ userId: a, name: "Routine" }).returning();
      const versions = await tx.insert(workoutVersionsTable).values([
        { workoutId: workout.id, versionNumber: 1, workoutName: "Old routine" },
        { workoutId: workout.id, versionNumber: 2, workoutName: "Renamed routine" },
      ]).returning();
      const first = await create(app, a, { ...input(), workoutName: "Old routine", date: "2026-01-01" });
      const second = await create(app, a, { ...input(), workoutName: "Renamed routine", date: "2026-01-02" });
      await tx.update(sessionsTable).set({ workoutVersionId: versions[0].id }).where(eq(sessionsTable.id, first.id));
      await tx.update(sessionsTable).set({ workoutVersionId: versions[1].id }).where(eq(sessionsTable.id, second.id));
      const { body } = await request(app).get("/api/dashboard").set("x-test-account", a)
        .query({ workoutKey: `template:${workout.id}` }).expect(200);
      expect(body.workouts).toHaveLength(1);
      expect(body.workoutVolume.map((p: { workoutName: string }) => p.workoutName)).toEqual(["Old routine", "Renamed routine"]);
    });
  });

  it("keeps precise decimal volumes and bounds extreme week ranges without losing totals", async () => {
    await fixture(async ({ app, a }) => {
      for (const date of ["0001-01-01", "9999-12-31"]) {
        await create(app, a, { ...input(), workoutName: "Decimal", date,
          exercises: [{ exerciseName: "Tiny", weightLb: 0.1, sets: [{ reps: 1 }, { reps: 2 }] }] });
      }
      const { body } = await request(app).get("/api/dashboard").set("x-test-account", a).expect(200);
      expect([body.totalSessions, body.totalSets, body.totalReps]).toEqual([2, 4, 6]);
      expect(body.weeklyWindowed).toBe(true);
      expect(body.weekly).toHaveLength(104);
      expect(body.weekly.at(-1)).toEqual({ weekStart: "9999-12-27", sessionCount: 1 });
      expect(body.workoutVolume.map((p: { volumeLbReps: number }) => p.volumeLbReps)).toEqual([0.3, 0.3]);
    });
  });

  it("guards dashboard selections, provides true zero states and safely retries failed reads", async () => {
    await fixture(async ({ app, tx, a, b }) => {
      const saved = await create(app, a);
      await request(app).get("/api/dashboard").expect(401);
      const empty = await request(app).get("/api/dashboard").set("x-test-account", b).expect(200);
      expect([empty.body.totalSessions, empty.body.totalSets, empty.body.totalReps]).toEqual([0, 0, 0]);
      expect(empty.body.exercises).toEqual([]);
      expect(empty.body.workouts).toEqual([]);
      expect(empty.body.weekly).toEqual([]);
      expect(empty.body.selectedExerciseId).toBeNull();
      for (const query of [
        { exerciseId: saved.exercises[0].exerciseId }, { workoutKey: `name:${saved.workoutName}` },
      ]) await request(app).get("/api/dashboard").query(query).set("x-test-account", b).expect(404);
      for (const query of ["exerciseId=1.5", "exerciseId=-1", "exerciseId=1&exerciseId=2", "workoutKey[x]=y", "workoutKey="]) {
        await request(app).get(`/api/dashboard?${query}`).set("x-test-account", a).expect(400);
      }
      const fail = vi.spyOn(tx.query.sessionsTable, "findMany").mockRejectedValueOnce(new Error("Private diagnostic"));
      try {
        const res = await request(app).get("/api/dashboard").set("x-test-account", a).expect(503);
        expect(res.body.error).toContain("Please try again");
        expect(JSON.stringify(res.body)).not.toContain("diagnostic");
      } finally { fail.mockRestore(); }
      expect((await request(app).get("/api/dashboard").set("x-test-account", a).expect(200)).body.totalSessions).toBe(1);
    });
  });

  it("searches literal workout names case-insensitively and sorts dates with stable ties", async () => {
    await fixture(async ({ app, a, b }) => {
      const older = await create(app, a, { ...input(), workoutName: "Upper 100%_\\ day", date: "2026-10-01" });
      const newer = await create(app, a, { ...input(), workoutName: "UPPER day", date: "2026-11-01" });
      const tied = await create(app, a, { ...input(), workoutName: "Upper tie", date: "2026-11-01" });
      const lower = await create(app, a, { ...input(), workoutName: "Lower day", date: "2026-09-01" });
      await create(app, b, { ...input(), workoutName: "Upper foreign", date: "2026-12-01" });
      const list = async (query: object) => (await request(app).get("/api/sessions")
        .query(query).set("x-test-account", a).expect(200)).body;
      expect((await list({ q: "  uPpEr  " })).map((s: { id: number }) => s.id)).toEqual([tied.id, newer.id, older.id]);
      expect((await list({ q: "upper", sort: "oldest" })).map((s: { id: number }) => s.id)).toEqual([older.id, newer.id, tied.id]);
      expect((await list({ sort: "oldest" })).map((s: { id: number }) => s.id)).toEqual([lower.id, older.id, newer.id, tied.id]);
      for (const q of ["%", "_", "\\", "100%_\\"]) {
        expect((await list({ q })).map((s: { id: number }) => s.id)).toEqual([older.id]);
      }
      expect(await list({ q: "' OR 1=1 --" })).toEqual([]);
      expect(await list({ q: "Bench press" })).toEqual([]); // Names, not exercises/notes.
      expect(await list({ q: "not present" })).toEqual([]);
      expect((await list({ q: "   " })).length).toBe(4);
    });
  });

  it("combines search, stars and both date directions without mutating saved contents", async () => {
    await fixture(async ({ app, a }) => {
      const older = await create(app, a, { ...input(), workoutName: "Upper old", date: "2026-10-01" });
      const newer = await create(app, a, { ...input(), workoutName: "Upper new", date: "2026-11-01" });
      await create(app, a, { ...input(), workoutName: "Upper unstarred" });
      for (const session of [older, newer]) {
        await request(app).put(`/api/sessions/${session.id}/star`).set("x-test-account", a).send({ starred: true }).expect(200);
      }
      for (const sort of ["oldest", "newest"]) {
        const result = await request(app).get("/api/sessions").set("x-test-account", a)
          .query({ q: "UPPER", sort, starredOnly: "true" }).expect(200);
        expect(result.body.map((s: { id: number }) => s.id)).toEqual(sort === "oldest" ? [older.id, newer.id] : [newer.id, older.id]);
        expect(result.body.every((s: { starred: boolean }) => s.starred)).toBe(true);
      }
      const saved = await request(app).get(`/api/sessions/${older.id}`).set("x-test-account", a).expect(200);
      expect(saved.body).toEqual({ ...older, starred: true });
    });
  });

  it("rejects malformed list filters and safely retries a failed read", async () => {
    await fixture(async ({ app, tx, a }) => {
      const saved = await create(app, a);
      for (const query of ["sort=random", "q=" + "a".repeat(121), "q=a&q=b", "q[nested]=a", "sort=oldest&sort=newest", "starredOnly=maybe"]) {
        await request(app).get(`/api/sessions?${query}`).set("x-test-account", a).expect(400);
      }
      const fail = vi.spyOn(tx.query.sessionsTable, "findMany").mockRejectedValueOnce(new Error("Private database diagnostic"));
      try {
        const result = await request(app).get("/api/sessions?q=upper&sort=oldest").set("x-test-account", a).expect(503);
        expect(result.body.error).toContain("Please try again");
        expect(JSON.stringify(result.body)).not.toContain("diagnostic");
      } finally { fail.mockRestore(); }
      const result = await request(app).get("/api/sessions?q=upper&sort=oldest").set("x-test-account", a).expect(200);
      expect(result.body.map((s: { id: number }) => s.id)).toEqual([saved.id]);
    });
  });

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
      await request(app).put("/api/sessions/1/star").send({ starred: true }).expect(401);
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

  it("stars and unstars idempotently using one junction row and preserves stars across session edits", async () => {
    await fixture(async ({ app, tx, a }) => {
      const first = await create(app, a);
      const second = await create(app, a);
      expect(first.starred).toBe(false);
      for (let i = 0; i < 2; i++) {
        const result = await request(app).put(`/api/sessions/${first.id}/star`)
          .set("x-test-account", a).send({ starred: true }).expect(200);
        expect(result.body).toEqual({ ...first, starred: true });
      }
      expect(await tx.select().from(starsTable).where(eq(starsTable.sessionId, first.id))).toHaveLength(1);
      const favorites = await request(app).get("/api/sessions?starredOnly=true").set("x-test-account", a).expect(200);
      expect(favorites.body.map((s: { id: number }) => s.id)).toEqual([first.id]);
      const all = await request(app).get("/api/sessions?starredOnly=false").set("x-test-account", a).expect(200);
      expect(all.body.map((s: { id: number }) => s.id)).toEqual([second.id, first.id]);
      const edited = await request(app).put(`/api/sessions/${first.id}`)
        .set("x-test-account", a).send({ ...input(), notes: "Changed notes" }).expect(200);
      expect(edited.body.starred).toBe(true);
      for (let i = 0; i < 2; i++) {
        const result = await request(app).put(`/api/sessions/${first.id}/star`)
          .set("x-test-account", a).send({ starred: false }).expect(200);
        expect(result.body.starred).toBe(false);
        expect(result.body.notes).toBe("Changed notes");
      }
      expect(await tx.select().from(starsTable).where(eq(starsTable.sessionId, first.id))).toHaveLength(0);
      expect((await request(app).get("/api/sessions?starredOnly=true").set("x-test-account", a).expect(200)).body).toEqual([]);
      expect((await request(app).get("/api/sessions").set("x-test-account", a).expect(200)).body).toHaveLength(2);
    });
  });

  it("scopes star writes and starred-only reads to the authenticated owner", async () => {
    await fixture(async ({ app, tx, a, b }) => {
      const own = await create(app, a);
      const other = await create(app, b);
      await request(app).put(`/api/sessions/${own.id}/star`).set("x-test-account", a)
        .send({ starred: true, userId: b }).expect(200);
      for (const starred of [true, false]) {
        await request(app).put(`/api/sessions/${own.id}/star`).set("x-test-account", b)
          .send({ starred }).expect(404);
      }
      await request(app).put(`/api/sessions/${other.id}/star`).set("x-test-account", b)
        .send({ starred: true }).expect(200);
      const result = await request(app).get("/api/sessions?starredOnly=true")
        .set("x-test-account", b).expect(200);
      expect(result.body.map((s: { id: number }) => s.id)).toEqual([other.id]);
      expect(await tx.select().from(starsTable).where(eq(starsTable.sessionId, own.id)))
        .toMatchObject([{ userId: a, sessionId: own.id }]);
      expect((await request(app).get(`/api/sessions/${own.id}`).set("x-test-account", a).expect(200)).body.starred).toBe(true);
    });
  });

  it("rejects malformed star preferences and filters without changing saved stars", async () => {
    await fixture(async ({ app, a }) => {
      const saved = await create(app, a);
      for (const data of [{}, { starred: "true" }, { starred: 1 }, { starred: null }]) {
        await request(app).put(`/api/sessions/${saved.id}/star`).set("x-test-account", a).send(data).expect(400);
      }
      await request(app).put("/api/sessions/not-an-id/star").set("x-test-account", a).send({ starred: true }).expect(404);
      await request(app).put("/api/sessions/2147483647/star").set("x-test-account", a).send({ starred: true }).expect(404);
      await request(app).get("/api/sessions?starredOnly=invalid").set("x-test-account", a).expect(400);
      expect((await request(app).get(`/api/sessions/${saved.id}`).set("x-test-account", a).expect(200)).body).toEqual(saved);
    });
  });

  it("returns a safe service error on failed star writes and allows an idempotent retry", async () => {
    await fixture(async ({ app, tx, a }) => {
      const saved = await create(app, a);
      const spy = vi.spyOn(tx, "transaction").mockRejectedValueOnce(new Error("Internal fixture error: do not expose"));
      try {
        const failure = await request(app).put(`/api/sessions/${saved.id}/star`)
          .set("x-test-account", a).send({ starred: true }).expect(503);
        expect(JSON.stringify(failure.body)).not.toContain("Internal fixture");
      } finally {
        spy.mockRestore();
      }
      expect((await request(app).get(`/api/sessions/${saved.id}`).set("x-test-account", a).expect(200)).body.starred).toBe(false);
      expect((await request(app).put(`/api/sessions/${saved.id}/star`).set("x-test-account", a)
        .send({ starred: true }).expect(200)).body.starred).toBe(true);
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

  it("rejects invalid writes and unsafe version links, and derives the owner on the server", async () => {
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
      await request(app).post("/api/sessions").set("x-test-account", a)
        .send({ ...input(), userId: b, workoutVersionId: 123 }).expect(404);
      const saved = await create(app, a, { ...input(), userId: b } as ReturnType<typeof input>);
      expect(saved.workoutVersionId).toBeNull();
      expect((await request(app).get("/api/sessions").set("x-test-account", b).expect(200)).body).toEqual([]);
      await request(app).get("/api/sessions/1.5").set("x-test-account", a).expect(404);
      await request(app).get("/api/sessions/not-an-id").set("x-test-account", a).expect(404);
    });
  });
});
