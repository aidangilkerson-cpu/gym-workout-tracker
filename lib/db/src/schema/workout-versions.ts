import { sql } from "drizzle-orm";
import { check, integer, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workoutsTable } from "./workouts";

export const workoutVersionsTable = pgTable("workout_versions", {
  id: serial("id").primaryKey(),
  workoutId: integer("workout_id").notNull().references(() => workoutsTable.id, { onDelete: "restrict" }),
  versionNumber: integer("version_number").notNull(),
  workoutName: text("workout_name").notNull(),
  savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("workout_versions_workout_number_unique").on(table.workoutId, table.versionNumber),
  check("workout_versions_number_positive", sql`${table.versionNumber} > 0`),
]);

export const insertWorkoutVersionSchema = createInsertSchema(workoutVersionsTable).omit({
  id: true,
  savedAt: true,
});
export type InsertWorkoutVersion = z.infer<typeof insertWorkoutVersionSchema>;
export type WorkoutVersion = typeof workoutVersionsTable.$inferSelect;
