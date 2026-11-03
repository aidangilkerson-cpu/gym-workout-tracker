import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  ListExercisesResponse, ListWorkoutsResponse, ListWorkoutsQueryParams,
  GetWorkoutParams, GetWorkoutResponse, CreateWorkoutBody, UpdateWorkoutBody, SetWorkoutArchiveBody,
} from "@workspace/api-zod";
import { getApplicationAccount } from "../lib/application-account";
import { SessionNotFound, type SessionDatabase } from "../lib/session-store";
import { listOwnedExercises, listOwnedWorkouts, getOwnedWorkout, saveOwnedWorkout, archiveOwnedWorkout, WorkoutConflict } from "../lib/workout-store";

export function createWorkoutsRouter(database: SessionDatabase = db): IRouter {
  const router = Router();
  const authorize = async (req: Request, res: Response, next: () => void) => {
    const account = await getApplicationAccount(req, res);
    if (!account) return;
    res.locals.accountId = account.id;
    next();
  };
  router.use("/workouts", authorize);
  router.use("/exercises", authorize);
  function failure(req: Request, res: Response, error: unknown) {
    if (error instanceof SessionNotFound) res.status(404).json({ error: "Workout or exercise not found." });
    else if (error instanceof WorkoutConflict) res.status(409).json({ error: error.message });
    else {
      req.log.error("Workout operation failed");
      res.status(503).json({ error: "We couldn't save or load your workout. Your draft is unchanged. Please try again." });
    }
  }
  function idFrom(req: Request, res: Response) {
    const parsed = GetWorkoutParams.safeParse(req.params);
    if (!parsed.success || !Number.isSafeInteger(parsed.data.id)) {
      res.status(404).json({ error: "Workout not found." });
      return null;
    }
    return parsed.data.id;
  }
  router.get("/exercises", async (req, res) => {
    try { res.json(ListExercisesResponse.parse(await listOwnedExercises(database, res.locals.accountId))); }
    catch (error) { failure(req, res, error); }
  });
  router.get("/workouts", async (req, res) => {
    const parsed = ListWorkoutsQueryParams.safeParse(req.query);
    if (!parsed.success || Object.entries(req.query).some(([k, v]) => typeof v !== "string" || k.startsWith("includeArchived["))) {
      res.status(400).json({ error: "Choose whether to include archived workouts." });
      return;
    }
    try { res.json(ListWorkoutsResponse.parse(await listOwnedWorkouts(database, res.locals.accountId, parsed.data.includeArchived === "true"))); }
    catch (error) { failure(req, res, error); }
  });
  router.get("/workouts/:id", async (req, res) => {
    const id = idFrom(req, res);
    if (id === null) return;
    try {
      const workout = await getOwnedWorkout(database, res.locals.accountId, id);
      if (!workout) throw new SessionNotFound();
      res.json(GetWorkoutResponse.parse(workout));
    } catch (error) { failure(req, res, error); }
  });
  const save = (editing: boolean) => async (req: Request, res: Response) => {
    const id = editing ? idFrom(req, res) : undefined;
    if (id === null) return;
    const parsed = (editing ? UpdateWorkoutBody : CreateWorkoutBody).safeParse(req.body);
    if (!parsed.success || !parsed.data.name.trim() || parsed.data.exercises.some(e => !e.exerciseName.trim())) {
      res.status(400).json({ error: "Give the workout and each exercise a name (up to 120 characters), and include 1–50 exercises." });
      return;
    }
    try {
      const expected = "expectedVersionId" in parsed.data ? parsed.data.expectedVersionId as number : undefined;
      const workout = await saveOwnedWorkout(database, res.locals.accountId, parsed.data, id, expected);
      res.status(editing ? 200 : 201).json(GetWorkoutResponse.parse(workout));
    } catch (error) { failure(req, res, error); }
  };
  router.post("/workouts", save(false));
  router.put("/workouts/:id", save(true));
  router.put("/workouts/:id/archive", async (req, res) => {
    const id = idFrom(req, res);
    if (id === null) return;
    const parsed = SetWorkoutArchiveBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Choose archive or restore." }); return; }
    try { res.json(GetWorkoutResponse.parse(await archiveOwnedWorkout(database, res.locals.accountId, id, parsed.data.archived))); }
    catch (error) { failure(req, res, error); }
  });
  return router;
}
export default createWorkoutsRouter();
