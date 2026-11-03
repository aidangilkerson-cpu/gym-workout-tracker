import { relations } from "drizzle-orm";
import { usersTable } from "./users";
import { exercisesTable } from "./exercises";
import { workoutsTable } from "./workouts";
import { workoutVersionsTable } from "./workout-versions";
import { workoutVersionExercisesTable } from "./workout-version-exercises";
import { sessionsTable } from "./sessions";
import { sessionExercisesTable } from "./session-exercises";
import { setsTable } from "./sets";
import { starsTable } from "./stars";

export const usersRelations = relations(usersTable, ({ many }) => ({
  exercises: many(exercisesTable),
  workouts: many(workoutsTable),
  sessions: many(sessionsTable),
  stars: many(starsTable),
}));

export const exercisesRelations = relations(exercisesTable, ({ one, many }) => ({
  user: one(usersTable, { fields: [exercisesTable.userId], references: [usersTable.id] }),
  versionEntries: many(workoutVersionExercisesTable),
  sessionEntries: many(sessionExercisesTable),
}));

export const workoutsRelations = relations(workoutsTable, ({ one, many }) => ({
  user: one(usersTable, { fields: [workoutsTable.userId], references: [usersTable.id] }),
  versions: many(workoutVersionsTable),
}));

export const workoutVersionsRelations = relations(workoutVersionsTable, ({ one, many }) => ({
  workout: one(workoutsTable, { fields: [workoutVersionsTable.workoutId], references: [workoutsTable.id] }),
  exercises: many(workoutVersionExercisesTable),
  sessions: many(sessionsTable),
}));

export const workoutVersionExercisesRelations = relations(workoutVersionExercisesTable, ({ one }) => ({
  version: one(workoutVersionsTable, {
    fields: [workoutVersionExercisesTable.workoutVersionId],
    references: [workoutVersionsTable.id],
  }),
  exercise: one(exercisesTable, {
    fields: [workoutVersionExercisesTable.exerciseId],
    references: [exercisesTable.id],
  }),
}));

export const sessionsRelations = relations(sessionsTable, ({ one, many }) => ({
  user: one(usersTable, { fields: [sessionsTable.userId], references: [usersTable.id] }),
  workoutVersion: one(workoutVersionsTable, {
    fields: [sessionsTable.workoutVersionId],
    references: [workoutVersionsTable.id],
  }),
  exercises: many(sessionExercisesTable),
  stars: many(starsTable),
}));

export const sessionExercisesRelations = relations(sessionExercisesTable, ({ one, many }) => ({
  session: one(sessionsTable, { fields: [sessionExercisesTable.sessionId], references: [sessionsTable.id] }),
  exercise: one(exercisesTable, { fields: [sessionExercisesTable.exerciseId], references: [exercisesTable.id] }),
  sets: many(setsTable),
}));

export const setsRelations = relations(setsTable, ({ one }) => ({
  sessionExercise: one(sessionExercisesTable, {
    fields: [setsTable.sessionExerciseId],
    references: [sessionExercisesTable.id],
  }),
}));

export const starsRelations = relations(starsTable, ({ one }) => ({
  user: one(usersTable, { fields: [starsTable.userId], references: [usersTable.id] }),
  session: one(sessionsTable, {
    fields: [starsTable.sessionId, starsTable.userId],
    references: [sessionsTable.id, sessionsTable.userId],
  }),
}));
