import BetterSqlite3 from "better-sqlite3";
import type { SqlDatabase } from "../models";

type BindValue = string | number | null;
type Bindings = Record<string, BindValue>;

function toNamedBindings(params: readonly BindValue[]): Bindings {
  return Object.fromEntries(
    params.map((value, index) => [String(index + 1), value]),
  );
}

export class TestSqliteDatabase implements SqlDatabase {
  private readonly connection: BetterSqlite3.Database;

  constructor() {
    this.connection = new BetterSqlite3(":memory:");
    this.connection.pragma("foreign_keys = ON");
  }

  async execute(
    sql: string,
    params: readonly BindValue[] = [],
  ): Promise<{ changes: number; lastInsertId?: number }> {
    const statement = this.connection.prepare(sql);
    const result =
      params.length === 0
        ? statement.run()
        : statement.run(toNamedBindings(params));
    return {
      changes: result.changes,
      ...(typeof result.lastInsertRowid === "number"
        ? { lastInsertId: result.lastInsertRowid }
        : {}),
    };
  }

  async query<T>(sql: string, params: readonly BindValue[] = []): Promise<T[]> {
    const statement = this.connection.prepare(sql);
    return (
      params.length === 0
        ? statement.all()
        : statement.all(toNamedBindings(params))
    ) as T[];
  }

  async executeScript(sql: string): Promise<void> {
    const transaction = this.connection.transaction(() =>
      this.connection.exec(sql),
    );
    transaction();
  }

  async currentMigrationVersion(): Promise<number> {
    const result = this.connection.pragma("user_version", { simple: true });
    if (typeof result !== "number")
      throw new Error("SQLite did not return a migration version.");
    return result;
  }

  close(): void {
    this.connection.close();
  }
}
