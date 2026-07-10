/**
 * Applies migrations + seeds the Handlager against DATABASE_PATH as a plain,
 * standalone Node process — run once via webServer.command in
 * playwright.config.ts, before `next dev` starts.
 *
 * Why this exists instead of just relying on src/instrumentation.ts (which
 * does the exact same two calls and normally runs at server boot): Next.js
 * dev server's on-demand, per-route module compilation re-evaluates
 * src/db/index.ts's module-level singleton independently for each route
 * bundle. Each re-evaluation calls `new Database(path)` again — a fresh
 * better-sqlite3 native connection — and in `next dev` specifically, those
 * later connections do not see the schema the instrumentation-hook
 * connection just migrated (confirmed empirically: sqlite_master queried via
 * a freshly-opened connection to the identical resolved file path returns no
 * tables, seconds after migration succeeded and was checkpointed on the
 * first connection, all within the same OS process). Running the migration
 * here, in a separate one-shot `tsx` process that exits before `next dev`
 * even starts, guarantees the schema is durably on disk before any
 * dev-server connection — first or fifteenth — ever opens the file.
 */
import { applyMigrations, getDb } from "@/db";
import { ensureHandlager } from "@/db/seed-handlager";
import { assertProductionSecrets, config } from "@/lib/config";

assertProductionSecrets(config);
applyMigrations(getDb());
ensureHandlager(getDb());
console.log(`[e2e] migrated + seeded ${config.databasePath}`);
