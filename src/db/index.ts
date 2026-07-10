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

let _sqlite: Database.Database | undefined;
let _db: DB | undefined;

export function getSqlite(): Database.Database {
  if (!_sqlite) _sqlite = openDatabase(config.databasePath);
  return _sqlite;
}

export function getDb(): DB {
  if (!_db) _db = drizzle(getSqlite(), { schema });
  return _db;
}

export const MIGRATIONS_FOLDER = "./drizzle";

export function applyMigrations(database: DB): void {
  migrate(database, { migrationsFolder: MIGRATIONS_FOLDER });
}
