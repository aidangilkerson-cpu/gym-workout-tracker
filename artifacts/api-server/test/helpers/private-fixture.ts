import { getTableName, sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  db, usersTable, exercisesTable, workoutsTable, workoutVersionsTable,
  workoutVersionExercisesTable, sessionsTable, sessionExercisesTable, setsTable, starsTable,
} from "@workspace/db";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Private reads, writes, FKs and sequences; never modify or expose real account data. */
export async function privateFixture(run: (tx: Transaction) => Promise<void>) {
  if (process.env.NODE_ENV === "production") throw new Error("Fixtures cannot run in production.");
  const rollback = new Error("Rollback private fixture");
  try {
    await db.transaction(async tx => {
      const tables = [usersTable, exercisesTable, workoutsTable, workoutVersionsTable,
        workoutVersionExercisesTable, sessionsTable, sessionExercisesTable, setsTable, starsTable];
      for (const table of tables) {
        const name = getTableName(table);
        await tx.execute(sql`CREATE TEMP TABLE ${sql.identifier(name)}
          (LIKE public.${sql.identifier(name)} INCLUDING ALL) ON COMMIT DROP`);
        if (table !== usersTable) {
          const sequence = `notes_${name}_id`;
          await tx.execute(sql`CREATE TEMP SEQUENCE ${sql.identifier(sequence)}`);
          await tx.execute(sql`ALTER TABLE pg_temp.${sql.identifier(name)}
            ALTER COLUMN id SET DEFAULT nextval(${sql.raw(`'pg_temp.${sequence}'`)}::regclass)`);
        }
      }
      for (const table of tables) {
        for (const key of getTableConfig(table).foreignKeys) {
          const { columns, foreignTable, foreignColumns } = key.reference();
          await tx.execute(sql`ALTER TABLE pg_temp.${sql.identifier(getTableName(table))}
            ADD FOREIGN KEY (${sql.join(columns.map(c => sql.identifier(c.name)), sql`, `)})
            REFERENCES pg_temp.${sql.identifier(getTableName(foreignTable))}
            (${sql.join(foreignColumns.map(c => sql.identifier(c.name)), sql`, `)})
            ON DELETE ${sql.raw(key.onDelete ?? "no action")}
            ON UPDATE ${sql.raw(key.onUpdate ?? "no action")}`);
        }
      }
      await tx.execute(sql`SET LOCAL search_path TO pg_temp, public`);
      await run(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}
