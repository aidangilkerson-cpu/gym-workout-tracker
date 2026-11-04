import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, expect, it, vi } from "vitest";
import { pool, usersTable } from "@workspace/db";
import { createSessionsRouter } from "../src/routes/sessions";
import { privateFixture } from "./helpers/private-fixture";

const identities = vi.hoisted(() => new Map<string, { id: string; authId: string; email: string }>());
vi.mock("../src/lib/application-account", () => ({
  getApplicationAccount: async (req: express.Request, res: express.Response) => {
    const identity = identities.get(req.get("x-test-account") ?? "");
    if (identity) return identity;
    res.status(401).json({ error: "Please sign in." });
    return null;
  },
}));
afterAll(async () => { identities.clear(); await pool.end(); });

it("exercise notes persist, edit and clear independently, validate safely and stay private", async () => {
  await privateFixture(async tx => {
    const [a, b] = [randomUUID(), randomUUID()];
    for (const id of [a, b]) {
      const account = { id, authId: `notes-${id}`, email: `notes-${id}@example.invalid` };
      await tx.insert(usersTable).values(account);
      identities.set(id, account);
    }
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.log = { error: vi.fn() } as unknown as typeof req.log; next(); });
    app.use("/api", createSessionsRouter(tx));
    const input = (workoutName: string, notes: string | null) => ({
      workoutName, date: "2026-11-02", notes: "Separate session note",
      exercises: [{ exerciseName: "Bench press", weightLb: 135.25, notes, sets: [{ reps: 10 }, { reps: 8 }] }],
    });
    const first = await request(app).post("/api/sessions").set("x-test-account", a).send(input("Push A", "Seat 3")).expect(201);
    const second = await request(app).post("/api/sessions").set("x-test-account", a).send(input("Full body", "Seat 4")).expect(201);
    expect(second.body.exercises[0].exerciseId).toBe(first.body.exercises[0].exerciseId);
    const path = `/api/sessions/${second.body.id}`;
    await request(app).put(path).set("x-test-account", a).send(input("Full body", "Slow eccentric")).expect(200);
    const reopened = await request(app).get(path).set("x-test-account", a).expect(200);
    expect(reopened.body.exercises[0].notes).toBe("Slow eccentric");
    expect(reopened.body.notes).toBe("Separate session note");
    const olderClient = input("Full body", null);
    Reflect.deleteProperty(olderClient.exercises[0], "notes");
    const preserved = await request(app).put(path).set("x-test-account", a).send(olderClient).expect(200);
    expect(preserved.body.exercises[0].notes).toBe("Slow eccentric");
    const original = await request(app).get(`/api/sessions/${first.body.id}`).set("x-test-account", a).expect(200);
    expect(original.body.exercises[0].notes).toBe("Seat 3");
    const rejected = await request(app).put(path).set("x-test-account", a).send(input("Full body", "x".repeat(5001))).expect(400);
    expect(rejected.body.fieldErrors["exercises.0.notes"]).toContain("5,000");
    expect((await request(app).get(path).set("x-test-account", a)).body.exercises[0].notes).toBe("Slow eccentric");
    await request(app).put(path).set("x-test-account", a).send(input("Full body", null)).expect(200);
    expect((await request(app).get(path).set("x-test-account", a)).body.exercises[0].notes).toBeNull();
    const history = await request(app).get("/api/sessions").set("x-test-account", a).expect(200);
    expect(history.body[0].exercises[0].notes).toBeNull();
    expect(history.body[1].exercises[0].notes).toBe("Seat 3");
    const other = await request(app).get("/api/sessions").set("x-test-account", b).expect(200);
    expect(other.body).toEqual([]);
    await request(app).get(path).set("x-test-account", b).expect(404);
    await request(app).put(path).set("x-test-account", b).send(input("Hijack", "Private")).expect(404);
    const foreignExercise = input("Foreign exercise", "Do not save");
    Object.assign(foreignExercise.exercises[0], { exerciseId: first.body.exercises[0].exerciseId });
    await request(app).post("/api/sessions").set("x-test-account", b).send(foreignExercise).expect(404);
    const legacy = input("Legacy input", null);
    Reflect.deleteProperty(legacy.exercises[0], "notes");
    const saved = await request(app).post("/api/sessions").set("x-test-account", b).send(legacy).expect(201);
    expect(saved.body.exercises[0].notes).toBeNull();
  });
});
