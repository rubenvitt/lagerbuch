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
import { eq } from "drizzle-orm";
import { applyMigrations, getDb, type DB } from "@/db";
import { ensureHandlager, HANDLAGER_ID } from "@/db/seed-handlager";
import { artikel, buchungen, chargen, newId, tokens } from "@/db/schema";
import { assertProductionSecrets, config } from "@/lib/config";

// Aktiver Token mit bekanntem Code + Artikel mit Bestand > 0, für
// e2e/helfer-flow.spec.ts (Einlösen → Entnahme). Idempotent, analog zu
// ensureHandlager.
const E2E_TOKEN_CODE = "111-111";

function ensureE2eHelferFixtures(db: DB): void {
  db.insert(tokens)
    .values({ id: "e2e-token", code: E2E_TOKEN_CODE, label: "E2E", aktiv: true, createdAt: new Date(), createdBy: "e2e" })
    .onConflictDoNothing()
    .run();

  db.insert(artikel)
    .values({ id: "e2e-artikel", name: "E2E Verbandpäckchen", einheit: "Stk", fach: "A1", mindestbestand: 0, aktiv: true, createdAt: new Date() })
    .onConflictDoNothing()
    .run();

  db.insert(chargen)
    .values({ id: "e2e-charge", artikelId: "e2e-artikel", chargenNr: "E2E-001", verfall: "2030-01", createdAt: new Date() })
    .onConflictDoNothing()
    .run();

  const bestehend = db.select().from(buchungen).where(eq(buchungen.chargeId, "e2e-charge")).get();
  if (!bestehend) {
    db.insert(buchungen)
      .values({
        id: newId(), ts: new Date(), typ: "zugang", artikelId: "e2e-artikel", chargeId: "e2e-charge",
        lagerortId: HANDLAGER_ID, menge: 10, quelleTyp: "system", quelleId: "e2e", kommentar: null,
      })
      .run();
  }
}

assertProductionSecrets(config);
applyMigrations(getDb());
ensureHandlager(getDb());
ensureE2eHelferFixtures(getDb());
console.log(`[e2e] migrated + seeded ${config.databasePath}`);
