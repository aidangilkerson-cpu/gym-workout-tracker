import { sql } from "drizzle-orm";
import { check, integer, pgTable, serial, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sessionExercisesTable } from "./session-exercises";

export const setsTable = pgTable("sets", {
  id: serial("id").primaryKey(),
  sessionExerciseId: integer("session_exercise_id").notNull().references(
    () => sessionExercisesTable.id, { onDelete: "cascade" },
  ),
  setNumber: integer("set_number").notNull(),
  reps: integer("reps").notNull(),
}, (table) => [
  unique("sets_exercise_number_unique").on(table.sessionExerciseId, table.setNumber),
  check("sets_number_positive", sql`${table.setNumber} > 0`),
  check("sets_reps_nonnegative", sql`${table.reps} >= 0`),
]);

export const insertSetSchema = createInsertSchema(setsTable).omit({ id: true });
export type InsertSet = z.infer<typeof insertSetSchema>;
export type ExerciseSet = typeof setsTable.$inferSelect;
