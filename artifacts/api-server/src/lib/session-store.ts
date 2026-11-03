import { and, asc, desc, eq } from "drizzle-orm";
import {
  db, usersTable, exercisesTable, sessionsTable, sessionExercisesTable, setsTable,
} from "@workspace/db";
import type { SessionInput } from "@workspace/api-zod";

export type SessionDatabase = Pick<typeof db,
  "query" | "select" | "insert" | "update" | "delete" | "transaction">;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class SessionNotFound extends Error {}

const contents = {
  exercises: {
    orderBy: [asc(sessionExercisesTable.position)],
    with: { sets: { orderBy: [asc(setsTable.setNumber)] } },
  },
};

export async function listOwnedSessions(database: SessionDatabase, userId: string) {
  return database.query.sessionsTable.findMany({
    where: eq(sessionsTable.userId, userId),
    orderBy: [desc(sessionsTable.date), desc(sessionsTable.id)],
    with: contents,
  });
}

export async function getOwnedSession(database: SessionDatabase, userId: string, id: number) {
  return database.query.sessionsTable.findFirst({
    where: and(eq(sessionsTable.userId, userId), eq(sessionsTable.id, id)),
    with: contents,
  });
}

async function saveExercises(tx: Transaction, userId: string, sessionId: number, input: SessionInput) {
  for (const [position, entry] of input.exercises.entries()) {
    let exerciseId = entry.exerciseId;
    if (exerciseId !== undefined) {
      const [owned] = await tx.select({ id: exercisesTable.id }).from(exercisesTable)
        .where(and(eq(exercisesTable.id, exerciseId), eq(exercisesTable.userId, userId)));
      // Identical 404 for missing and another user's records.
      if (!owned) throw new SessionNotFound();
    } else {
      // Reuse an active stable exercise identity within this account only.
      const [existing] = await tx.select({ id: exercisesTable.id }).from(exercisesTable)
        .where(and(
          eq(exercisesTable.userId, userId),
          eq(exercisesTable.name, entry.exerciseName.trim()),
          eq(exercisesTable.archived, false),
        )).orderBy(asc(exercisesTable.id)).limit(1);
      if (existing) exerciseId = existing.id;
      else {
        const [created] = await tx.insert(exercisesTable).values({
          userId, name: entry.exerciseName.trim(),
        }).returning({ id: exercisesTable.id });
        exerciseId = created.id;
      }
    }
    const [saved] = await tx.insert(sessionExercisesTable).values({
      sessionId, exerciseId, exerciseName: entry.exerciseName.trim(),
      weightLb: entry.weightLb, position,
    }).returning({ id: sessionExercisesTable.id });
    await tx.insert(setsTable).values(entry.sets.map((set, index) => ({
      sessionExerciseId: saved.id, setNumber: index + 1, reps: set.reps,
    })));
  }
}

export async function saveOwnedSession(
  database: SessionDatabase, userId: string, input: SessionInput, id?: number,
) {
  return database.transaction(async (tx) => {
    // Serialize saves per account, avoiding duplicate library identities from
    // simultaneous first-time exercise entry without changing the planned schema.
    await tx.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.id, userId)).for("update");
    let sessionId = id;
    if (sessionId !== undefined) {
      const [owned] = await tx.select({ id: sessionsTable.id }).from(sessionsTable)
        .where(and(eq(sessionsTable.id, sessionId), eq(sessionsTable.userId, userId)))
        .for("update");
      if (!owned) throw new SessionNotFound();
      await tx.update(sessionsTable).set({
        workoutName: input.workoutName.trim(), date: input.date, notes: input.notes,
      }).where(and(eq(sessionsTable.id, sessionId), eq(sessionsTable.userId, userId)));
      // All replacement work is one transaction: errors retain the old session.
      await tx.delete(sessionExercisesTable).where(eq(sessionExercisesTable.sessionId, sessionId));
    } else {
      const [created] = await tx.insert(sessionsTable).values({
        userId, workoutName: input.workoutName.trim(), date: input.date, notes: input.notes,
      }).returning({ id: sessionsTable.id });
      sessionId = created.id;
    }
    await saveExercises(tx, userId, sessionId, input);
    return getOwnedSession(tx, userId, sessionId);
  });
}

export async function deleteOwnedSession(database: SessionDatabase, userId: string, id: number) {
  const [deleted] = await database.delete(sessionsTable)
    .where(and(eq(sessionsTable.id, id), eq(sessionsTable.userId, userId)))
    .returning({ id: sessionsTable.id });
  return !!deleted;
}
