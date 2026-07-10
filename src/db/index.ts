import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "@/lib/config";
import * as schema from "@/db/schema";

export type DB = BetterSQLite3Database<typeof schema>;

function openDatabase(path: string): Database.Database {
  if (path !== ":memory:") {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");
  return sqlite;
}

// Cache the connection on globalThis (the standard Next.js dev pattern): `next dev`
// re-evaluates this module on every HMR/reload, so plain module-scope variables would
// otherwise be reset, opening extra sqlite connections or missing a fresh migration.
// Stable in production (one process, module loaded once), so this doesn't change
// production behavior. createTestDb() builds its own connection directly, not via
// getDb(), so it is unaffected too.
const globalForDb = globalThis as unknown as { __lagerbuchSqlite?: Database.Database; __lagerbuchDb?: DB };

export function getSqlite(): Database.Database {
  if (!globalForDb.__lagerbuchSqlite) globalForDb.__lagerbuchSqlite = openDatabase(config.databasePath);
  return globalForDb.__lagerbuchSqlite;
}

export function getDb(): DB {
  if (!globalForDb.__lagerbuchDb) globalForDb.__lagerbuchDb = drizzle(getSqlite(), { schema });
  return globalForDb.__lagerbuchDb;
}

export const MIGRATIONS_FOLDER = "./drizzle";

export function applyMigrations(database: DB): void {
  migrate(database, { migrationsFolder: MIGRATIONS_FOLDER });
}
