import * as SQLite from "expo-sqlite";
import { AppError, migrateDatabase, type SqlDatabase } from "@smartbiz/core";

type BindValue = string | number | null;

class ExpoSqlDatabase implements SqlDatabase {
  constructor(private readonly database: SQLite.SQLiteDatabase) {}

  async execute(
    sql: string,
    params: readonly BindValue[] = [],
  ): Promise<{ changes: number; lastInsertId?: number }> {
    const result = await this.database.runAsync(sql, [...params]);
    return {
      changes: result.changes,
      ...(result.lastInsertRowId
        ? { lastInsertId: result.lastInsertRowId }
        : {}),
    };
  }

  query<T>(sql: string, params: readonly BindValue[] = []): Promise<T[]> {
    return this.database.getAllAsync<T>(sql, [...params]);
  }

  /**
   * Executes migration SQL. `PRAGMA user_version = N` statements are extracted
   * and executed outside the transaction because SQLite silently ignores
   * header-modifying PRAGMAs when they run inside a transaction (the case on
   * Android, where `executeScript` runs inside `withExclusiveTransactionAsync`).
   * Everything else runs inside the transaction for atomicity.
   */
  async executeScript(sql: string): Promise<void> {
    const pragmaStatements: string[] = [];
    const sqlWithoutPragma = sql.replace(
      /PRAGMA\s+user_version\s*=\s*\d+\s*;?/gi,
      (match) => {
        pragmaStatements.push(match);
        return "";
      },
    ).trim();

    if (sqlWithoutPragma.length > 0) {
      await this.database.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.execAsync(sqlWithoutPragma);
      });
    }

    // PRAGMA user_version must be set outside the transaction to actually persist.
    for (const pragma of pragmaStatements) {
      await this.database.execAsync(pragma);
    }
  }

  async currentMigrationVersion(): Promise<number> {
    const row = await this.database.getFirstAsync<{ user_version: number }>(
      "PRAGMA user_version",
    );
    return row?.user_version ?? 0;
  }
}

export async function openApplicationDatabase(): Promise<SqlDatabase> {
  const nativeDatabase = await SQLite.openDatabaseAsync("smartbiz.db");
  await nativeDatabase.execAsync(
    "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;",
  );
  const database = new ExpoSqlDatabase(nativeDatabase);
  try {
    await migrateDatabase(database);
  } catch (error) {
    throw new AppError(
      "PERSISTENCE",
      error instanceof Error ? error.message : "Database migration failed.",
    );
  }
  return database;
}
