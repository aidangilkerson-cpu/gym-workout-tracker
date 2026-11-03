import { date, index, integer, pgTable, serial, text, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { workoutVersionsTable } from "./workout-versions";

export const sessionsTable = pgTable("sessions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
  workoutVersionId: integer("workout_version_id").references(() => workoutVersionsTable.id, { onDelete: "restrict" }),
  workoutName: text("workout_name").notNull(),
  date: date("date", { mode: "string" }).notNull(),
  notes: text("notes"),
}, (table) => [
  index("sessions_user_date_idx").on(table.userId, table.date),
  index("sessions_workout_version_idx").on(table.workoutVersionId),
  // Lets stars enforce that the session belongs to the starring user.
  unique("sessions_id_user_unique").on(table.id, table.userId),
]);

export const insertSessionSchema = createInsertSchema(sessionsTable).omit({ id: true });
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type WorkoutSession = typeof sessionsTable.$inferSelect;
