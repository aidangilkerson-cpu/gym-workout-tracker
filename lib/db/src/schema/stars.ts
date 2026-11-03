import { foreignKey, index, integer, pgTable, serial, text, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { sessionsTable } from "./sessions";

export const starsTable = pgTable("stars", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
  sessionId: integer("session_id").notNull(),
}, (table) => [
  unique("stars_user_session_unique").on(table.userId, table.sessionId),
  index("stars_session_idx").on(table.sessionId),
  foreignKey({
    name: "stars_session_owner_fk",
    columns: [table.sessionId, table.userId],
    foreignColumns: [sessionsTable.id, sessionsTable.userId],
  }).onDelete("cascade"),
]);

export const insertStarSchema = createInsertSchema(starsTable).omit({ id: true });
export type InsertStar = z.infer<typeof insertStarSchema>;
export type Star = typeof starsTable.$inferSelect;
