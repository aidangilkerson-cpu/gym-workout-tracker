import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, serial, text, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { exercisesTable } from "./exercises";
import { workoutVersionsTable } from "./workout-versions";

export const workoutVersionExercisesTable = pgTable("workout_version_exercises", {
  id: serial("id").primaryKey(),
  workoutVersionId: integer("workout_version_id").notNull().references(
    () => workoutVersionsTable.id, { onDelete: "restrict" },
  ),
  exerciseId: integer("exercise_id").notNull().references(() => exercisesTable.id, { onDelete: "restrict" }),
  exerciseName: text("exercise_name").notNull(),
  position: integer("position").notNull(),
}, (table) => [
  unique("workout_version_exercises_position_unique").on(table.workoutVersionId, table.position),
  index("workout_version_exercises_exercise_idx").on(table.exerciseId),
  check("workout_version_exercises_position_nonnegative", sql`${table.position} >= 0`),
]);

export const insertWorkoutVersionExerciseSchema = createInsertSchema(workoutVersionExercisesTable).omit({ id: true });
export type InsertWorkoutVersionExercise = z.infer<typeof insertWorkoutVersionExerciseSchema>;
export type WorkoutVersionExercise = typeof workoutVersionExercisesTable.$inferSelect;
