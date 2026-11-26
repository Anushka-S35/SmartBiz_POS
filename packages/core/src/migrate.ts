import { AppError } from "./errors";
import { migrations } from "./migrations";
import type { SqlDatabase } from "./models";

export async function migrateDatabase(database: SqlDatabase): Promise<void> {
  let version = await database.currentMigrationVersion();
  for (const migration of migrations) {
    if (migration.version <= version) continue;
    if (migration.version !== version + 1) {
      throw new AppError(
        "PERSISTENCE",
        `Database migration ${migration.version} is out of sequence.`,
      );
    }
    try {
      // executeScript (in database-driver.native.ts) extracts PRAGMA user_version
      // and sets it outside the transaction so it actually persists on Android.
      await database.executeScript(migration.sql);
    } catch (error) {
      // A previous run may have already applied the schema changes while
      // failing to persist `user_version` (PRAGMA ignored inside a transaction
      // on Android). If the error indicates the change is already in place
      // (e.g. "duplicate column name" or "table already exists"), treat the
      // migration as applied and bump the version so subsequent restarts skip it.
      const message = error instanceof Error ? error.message : String(error);
      const alreadyApplied =
        /duplicate column/i.test(message) ||
        /already exists/i.test(message) ||
        /duplicate object/i.test(message);
      if (!alreadyApplied) throw error;
    }
    version = migration.version;
  }
}
