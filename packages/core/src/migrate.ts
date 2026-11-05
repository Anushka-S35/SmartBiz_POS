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
    await database.executeScript(migration.sql);
    version = migration.version;
  }
}
