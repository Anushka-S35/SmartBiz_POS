import TauriDatabase from "@tauri-apps/plugin-sql";
import { AppError, migrateDatabase, type SqlDatabase } from "@smartbiz/core";

type BindValue = string | number | null;

class TauriSqlDatabase implements SqlDatabase {
  constructor(private readonly database: TauriDatabase) {}

  async execute(
    sql: string,
    params: readonly BindValue[] = [],
  ): Promise<{ changes: number; lastInsertId?: number }> {
    const result = await this.database.execute(sql, [...params]);
    return {
      changes: result.rowsAffected,
      ...(result.lastInsertId !== undefined
        ? { lastInsertId: result.lastInsertId }
        : {}),
    };
  }

  query<T>(sql: string, params: readonly BindValue[] = []): Promise<T[]> {
    return this.database.select<T[]>(sql, [...params]);
  }

  async executeScript(): Promise<void> {
    throw new AppError(
      "PERSISTENCE",
      "Desktop migrations are managed by the Tauri SQL plugin.",
    );
  }

  async currentMigrationVersion(): Promise<number> {
    const rows = await this.database.select<Array<{ user_version: number }>>(
      "SELECT user_version FROM pragma_user_version",
    );
    return rows[0]?.user_version ?? 0;
  }
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function openApplicationDatabase(): Promise<SqlDatabase> {
  if (!isTauriRuntime()) {
    throw new AppError(
      "UNSUPPORTED_PLATFORM",
      "A browser page has no configured SmartBiz database. Use the Tauri desktop app or a supported native app; browser data and desktop SQLite are separate.",
    );
  }
  try {
    const database = new TauriSqlDatabase(
      await TauriDatabase.load("sqlite:smartbiz.db"),
    );
    await migrateDatabase(database);
    return database;
  } catch (error) {
    throw new AppError(
      "PERSISTENCE",
      error instanceof Error ? error.message : "Database could not be opened.",
    );
  }
}
