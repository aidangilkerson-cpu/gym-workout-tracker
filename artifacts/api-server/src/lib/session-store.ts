import { and, asc, desc, eq, ilike, inArray } from "drizzle-orm";
import {
  db, usersTable, exercisesTable, sessionsTable, sessionExercisesTable, setsTable, starsTable, workoutVersionsTable,
} from "@workspace/db";
import type { SessionInput, ListSessionsParams } from "@workspace/api-zod";

export type SessionDatabase = Pick<typeof db,
  "query" | "select" | "insert" | "update" | "delete" | "transaction">;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class SessionNotFound extends Error {}
export class SessionConflict extends Error {}

const contents = {
  exercises: {
    orderBy: [asc(sessionExercisesTable.position)],
    with: { sets: { orderBy: [asc(setsTable.setNumber)] } },
  },
};

function sessionContents(userId: string) {
  return { ...contents, stars: { columns: { id: true } as const, where: eq(starsTable.userId, userId) } };
}

function withStarState<T extends { stars: { id: number }[] }>(session: T) {
  const { stars, ...record } = session;
  return { ...record, starred: stars.length > 0 };
}

export async function listOwnedSessions(database: SessionDatabase, userId: string, options: ListSessionsParams = {}) {
  const search = options.q?.trim();
  // Treat SQL pattern characters literally; Drizzle binds the resulting value.
  const pattern = search ? `%${search.replace(/[\\%_]/g, "\\$&")}%` : undefined;
  const sessions = await database.query.sessionsTable.findMany({
    where: and(
      eq(sessionsTable.userId, userId),
      options.starredOnly === "true" ? inArray(sessionsTable.id, database.select({ id: starsTable.sessionId })
        .from(starsTable).where(eq(starsTable.userId, userId))) : undefined,
      pattern ? ilike(sessionsTable.workoutName, pattern) : undefined,
    ),
    orderBy: options.sort === "oldest"
      ? [asc(sessionsTable.date), asc(sessionsTable.id)]
      : [desc(sessionsTable.date), desc(sessionsTable.id)],
    with: sessionContents(userId),
  });
  return sessions.map(withStarState);
}

export async function getOwnedSession(database: SessionDatabase, userId: string, id: number) {
  const session = await database.query.sessionsTable.findFirst({
    where: and(eq(sessionsTable.userId, userId), eq(sessionsTable.id, id)),
    with: sessionContents(userId),
  });
  return session ? withStarState(session) : undefined;
}

export async function setOwnedSessionStar(database: SessionDatabase, userId: string, id: number, starred: boolean) {
  return database.transaction(async (tx) => {
    // Match session saves' account → session lock order, including FK checks,
    // so starring and editing concurrently cannot acquire those locks in reverse.
    await tx.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.id, userId)).for("update");
    const [owned] = await tx.select({ id: sessionsTable.id }).from(sessionsTable)
      .where(and(eq(sessionsTable.id, id), eq(sessionsTable.userId, userId))).for("update");
    if (!owned) throw new SessionNotFound();
    if (starred) {
      await tx.insert(starsTable).values({ userId, sessionId: id }).onConflictDoNothing({
        target: [starsTable.userId, starsTable.sessionId],
      });
    } else {
      await tx.delete(starsTable).where(and(eq(starsTable.userId, userId), eq(starsTable.sessionId, id)));
    }
    return getOwnedSession(tx, userId, id);
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
      const [owned] = await tx.select({ id: sessionsTable.id, workoutVersionId: sessionsTable.workoutVersionId }).from(sessionsTable)
        .where(and(eq(sessionsTable.id, sessionId), eq(sessionsTable.userId, userId)))
        .for("update");
      if (!owned) throw new SessionNotFound();
      if (input.workoutVersionId !== undefined && input.workoutVersionId !== owned.workoutVersionId) {
        throw new SessionConflict("A saved session keeps its original workout version. Its results have not been changed.");
      }
      await tx.update(sessionsTable).set({
        workoutName: input.workoutName.trim(), date: input.date, notes: input.notes,
      }).where(and(eq(sessionsTable.id, sessionId), eq(sessionsTable.userId, userId)));
      // All replacement work is one transaction: errors retain the old session.
      await tx.delete(sessionExercisesTable).where(eq(sessionExercisesTable.sessionId, sessionId));
    } else {
      if (input.workoutVersionId != null) {
        const version = await tx.query.workoutVersionsTable.findFirst({
          where: eq(workoutVersionsTable.id, input.workoutVersionId), with: { workout: true },
        });
        if (!version || version.workout.userId !== userId) throw new SessionNotFound();
        if (version.workout.archived) {
          throw new SessionConflict("This workout was archived. Restore it before logging the session; your draft is unchanged.");
        }
      }
      const [created] = await tx.insert(sessionsTable).values({
        userId, workoutName: input.workoutName.trim(), date: input.date, notes: input.notes,
        workoutVersionId: input.workoutVersionId ?? null,
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
