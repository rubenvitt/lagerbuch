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
import { artikel, buchungen, chargen, lagerorte, newId, sollPositionen, tokens } from "@/db/schema";
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

// Artikel mit einer abgelaufenen Charge (rest > 0), für
// e2e/verfall.spec.ts (Warnliste → aussondern). Idempotent, analog zu
// ensureE2eHelferFixtures.
function ensureE2eVerfallFixtures(db: DB): void {
  db.insert(artikel)
    .values({ id: "e2e-verfall-artikel", name: "E2E Verfall NaCl", einheit: "Fl.", fach: "B2", mindestbestand: 0, aktiv: true, createdAt: new Date() })
    .onConflictDoNothing()
    .run();

  db.insert(chargen)
    .values({ id: "e2e-verfall-charge", artikelId: "e2e-verfall-artikel", chargenNr: "E2E-EXP", verfall: "2020-01", createdAt: new Date() })
    .onConflictDoNothing()
    .run();

  const bestehend = db.select().from(buchungen).where(eq(buchungen.chargeId, "e2e-verfall-charge")).get();
  if (!bestehend) {
    db.insert(buchungen)
      .values({
        id: newId(), ts: new Date(), typ: "zugang", artikelId: "e2e-verfall-artikel", chargeId: "e2e-verfall-charge",
        lagerortId: HANDLAGER_ID, menge: 3, quelleTyp: "system", quelleId: "e2e", kommentar: null,
      })
      .run();
  }
}

// Fahrzeug + Soll-Position für e2e/check.spec.ts (Helfer-Check → Fehlmenge
// → referenz=check-Buchung → Admin-Historie). Nutzt den bestehenden
// e2e-artikel (Handlager-Bestand > 0 aus ensureE2eHelferFixtures). Idempotent,
// analog zu ensureE2eHelferFixtures.
function ensureE2eCheckFixtures(db: DB): void {
  db.insert(lagerorte)
    .values({ id: "e2e-fahrzeug", name: "E2E RTW", typ: "fahrzeug", kennung: null, aktiv: true })
    .onConflictDoNothing()
    .run();

  db.insert(sollPositionen)
    .values({ id: "e2e-soll", fahrzeugId: "e2e-fahrzeug", fachLabel: "E2E Fach", sort: 0, artikelId: "e2e-artikel", soll: 3 })
    .onConflictDoNothing()
    .run();
}

assertProductionSecrets(config);
applyMigrations(getDb());
ensureHandlager(getDb());
ensureE2eHelferFixtures(getDb());
ensureE2eVerfallFixtures(getDb());
ensureE2eCheckFixtures(getDb());
console.log(`[e2e] migrated + seeded ${config.databasePath}`);
