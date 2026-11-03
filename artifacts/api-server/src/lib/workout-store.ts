import { and, asc, desc, eq } from "drizzle-orm";
import {
  usersTable, exercisesTable, workoutsTable, workoutVersionsTable, workoutVersionExercisesTable,
} from "@workspace/db";
import type { WorkoutDetail, WorkoutInput, WorkoutSummary } from "@workspace/api-zod";
import { SessionNotFound, type SessionDatabase } from "./session-store";

export class WorkoutConflict extends Error {}

export async function listOwnedExercises(database: SessionDatabase, userId: string) {
  return database.select({ id: exercisesTable.id, name: exercisesTable.name }).from(exercisesTable)
    .where(and(eq(exercisesTable.userId, userId), eq(exercisesTable.archived, false)))
    .orderBy(asc(exercisesTable.name), asc(exercisesTable.id));
}

export async function listOwnedWorkouts(database: SessionDatabase, userId: string, includeArchived = false): Promise<WorkoutSummary[]> {
  const rows = await database.query.workoutsTable.findMany({
    where: and(eq(workoutsTable.userId, userId), includeArchived ? undefined : eq(workoutsTable.archived, false)),
    orderBy: [desc(workoutsTable.id)],
    with: { versions: { columns: { id: true, versionNumber: true }, orderBy: [desc(workoutVersionsTable.versionNumber)], limit: 1 } },
  });
  return rows.map(w => ({
    id: w.id, name: w.name, archived: w.archived,
    latestVersionId: w.versions[0]?.id ?? null, latestVersionNumber: w.versions[0]?.versionNumber ?? null,
  }));
}

export async function getOwnedWorkout(database: SessionDatabase, userId: string, id: number): Promise<WorkoutDetail | undefined> {
  const workout = await database.query.workoutsTable.findFirst({
    where: and(eq(workoutsTable.userId, userId), eq(workoutsTable.id, id)),
    columns: { id: true, name: true, archived: true },
    with: {
      versions: {
        orderBy: [desc(workoutVersionsTable.versionNumber)],
        with: { exercises: { orderBy: [asc(workoutVersionExercisesTable.position)] } },
      },
    },
  });
  if (!workout) return undefined;
  return { ...workout, versions: workout.versions.map(v => ({ ...v, savedAt: v.savedAt.toISOString() })) };
}

/** Account-first locking matches session saves; the entire version is atomic. */
export async function saveOwnedWorkout(
  database: SessionDatabase, userId: string, input: WorkoutInput, id?: number, expectedVersionId?: number,
) {
  return database.transaction(async tx => {
    await tx.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, userId)).for("update");
    let workoutId = id;
    let versionNumber = 1;
    const retainedArchived = new Set<number>();
    if (workoutId !== undefined) {
      const [owned] = await tx.select().from(workoutsTable)
        .where(and(eq(workoutsTable.id, workoutId), eq(workoutsTable.userId, userId))).for("update");
      if (!owned) throw new SessionNotFound();
      if (owned.archived) throw new WorkoutConflict("Restore this workout before editing it. Your draft has not been saved.");
      const latest = await tx.query.workoutVersionsTable.findFirst({
        where: eq(workoutVersionsTable.workoutId, workoutId), orderBy: [desc(workoutVersionsTable.versionNumber)],
        with: { exercises: { columns: { exerciseId: true } } },
      });
      if (!latest || latest.id !== expectedVersionId) {
        throw new WorkoutConflict("This workout has a newer version. Your draft is unchanged; review the latest version before saving again.");
      }
      versionNumber = latest.versionNumber + 1;
      for (const entry of latest.exercises) retainedArchived.add(entry.exerciseId);
      await tx.update(workoutsTable).set({ name: input.name.trim() }).where(eq(workoutsTable.id, workoutId));
    } else {
      const [created] = await tx.insert(workoutsTable).values({ userId, name: input.name.trim() }).returning();
      workoutId = created.id;
    }
    const [version] = await tx.insert(workoutVersionsTable).values({
      workoutId, versionNumber, workoutName: input.name.trim(),
    }).returning();
    for (const [position, entry] of input.exercises.entries()) {
      let exerciseId = entry.exerciseId;
      if (exerciseId !== undefined) {
        const [owned] = await tx.select({ id: exercisesTable.id, archived: exercisesTable.archived }).from(exercisesTable)
          .where(and(eq(exercisesTable.id, exerciseId), eq(exercisesTable.userId, userId)));
        if (!owned || (owned.archived && !retainedArchived.has(exerciseId))) throw new SessionNotFound();
      } else {
        const [existing] = await tx.select({ id: exercisesTable.id }).from(exercisesTable)
          .where(and(eq(exercisesTable.userId, userId), eq(exercisesTable.archived, false), eq(exercisesTable.name, entry.exerciseName.trim())))
          .orderBy(asc(exercisesTable.id)).limit(1);
        if (existing) exerciseId = existing.id;
        else {
          const [created] = await tx.insert(exercisesTable).values({ userId, name: entry.exerciseName.trim() }).returning();
          exerciseId = created.id;
        }
      }
      await tx.insert(workoutVersionExercisesTable).values({
        workoutVersionId: version.id, exerciseId, exerciseName: entry.exerciseName.trim(), position,
      });
    }
    return getOwnedWorkout(tx, userId, workoutId);
  });
}

export async function archiveOwnedWorkout(database: SessionDatabase, userId: string, id: number, archived: boolean) {
  return database.transaction(async tx => {
    await tx.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, userId)).for("update");
    const [owned] = await tx.update(workoutsTable).set({ archived })
      .where(and(eq(workoutsTable.id, id), eq(workoutsTable.userId, userId))).returning({ id: workoutsTable.id });
    if (!owned) throw new SessionNotFound();
    return getOwnedWorkout(tx, userId, id);
  });
}
