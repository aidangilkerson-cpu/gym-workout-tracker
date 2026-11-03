import { sql } from "drizzle-orm";
import { check, index, integer, numeric, pgTable, serial, text, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { exercisesTable } from "./exercises";
import { sessionsTable } from "./sessions";

export const sessionExercisesTable = pgTable("session_exercises", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => sessionsTable.id, { onDelete: "cascade" }),
  exerciseId: integer("exercise_id").notNull().references(() => exercisesTable.id, { onDelete: "restrict" }),
  exerciseName: text("exercise_name").notNull(),
  // A session's exercise holds one shared weight; individual sets hold only reps.
  weightLb: numeric("weight_lb", { precision: 10, scale: 2, mode: "number" }).notNull(),
  position: integer("position").notNull(),
}, (table) => [
  unique("session_exercises_position_unique").on(table.sessionId, table.position),
  index("session_exercises_exercise_idx").on(table.exerciseId),
  check("session_exercises_weight_nonnegative", sql`${table.weightLb} >= 0 AND ${table.weightLb} <> 'NaN'::numeric`),
  check("session_exercises_position_nonnegative", sql`${table.position} >= 0`),
]);

export const insertSessionExerciseSchema = createInsertSchema(sessionExercisesTable).omit({ id: true });
export type InsertSessionExercise = z.infer<typeof insertSessionExerciseSchema>;
export type SessionExercise = typeof sessionExercisesTable.$inferSelect;
