"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { and, count, eq, type SQL } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { getDb, type DB } from "@/db";
import {
  artikel,
  buchungen,
  chargen,
  sollPositionen,
  lagerorte,
  checks,
  tokens,
  bzGeraete,
  bzKontrollen,
  o2Flaschen,
  o2Messungen,
  geraete,
} from "@/db/schema";
import { HANDLAGER_ID } from "@/db/seed-handlager";
import { requireAdmin } from "@/actions/session";
import { ELEMENT_ARTEN, type ElementArt, type Loeschbarkeit } from "@/lib/loeschen";

// ── Hilfen ───────────────────────────────────────────────────────────────────

function anzahl(db: DB, table: SQLiteTable, where: SQL): number {
  return db.select({ n: count() }).from(table).where(where).get()?.n ?? 0;
}

function plural(n: number, ein: string, mehr: string): string {
  return `${n} ${n === 1 ? ein : mehr}`;
}

function verknuepftGrund(teile: string[]): string {
  return `Noch mit ${teile.join(", ")} verknüpft — Löschen würde den Nachweis zerstören.`;
}

const ArtSchema = z.enum(ELEMENT_ARTEN);
const IdSchema = z.string().min(1);

const REVALIDATE: Record<ElementArt, string[]> = {
  artikel: ["/verwaltung/artikel", "/verwaltung"],
  fahrzeug: ["/verwaltung/fahrzeuge", "/verwaltung"],
  token: ["/verwaltung/tokens"],
  bzGeraet: ["/verwaltung/bz"],
  o2Flasche: ["/verwaltung/sauerstoff"],
  geraet: ["/verwaltung/geraete"],
};

// ── Prüf-Logik je Art (rein, DB-lesend) ──────────────────────────────────────

function pruefeArtikel(db: DB, id: string): Loeschbarkeit {
  const buch = anzahl(db, buchungen, eq(buchungen.artikelId, id));
  const chg = anzahl(db, chargen, eq(chargen.artikelId, id));
  const soll = anzahl(db, sollPositionen, eq(sollPositionen.artikelId, id));
  if (buch + chg + soll === 0) return { loeschbar: true };
  const teile: string[] = [];
  if (buch) teile.push(plural(buch, "Buchung", "Buchungen"));
  if (chg) teile.push(plural(chg, "Charge", "Chargen"));
  if (soll) teile.push(plural(soll, "Soll-Position", "Soll-Positionen"));
  return { loeschbar: false, grund: verknuepftGrund(teile), kannDeaktivieren: true };
}

function pruefeFahrzeug(db: DB, id: string): Loeschbarkeit {
  if (id === HANDLAGER_ID) {
    return { loeschbar: false, grund: "Das Handlager ist fest im System verankert und kann nicht gelöscht werden.", kannDeaktivieren: false };
  }
  const buch = anzahl(db, buchungen, eq(buchungen.lagerortId, id));
  const soll = anzahl(db, sollPositionen, eq(sollPositionen.fahrzeugId, id));
  const chk = anzahl(db, checks, eq(checks.fahrzeugId, id));
  const bzGer = anzahl(db, bzGeraete, eq(bzGeraete.lagerortId, id));
  const ger = anzahl(db, geraete, eq(geraete.lagerortId, id));
  const flaschen = anzahl(db, o2Flaschen, eq(o2Flaschen.lagerortId, id));
  const codes = anzahl(db, tokens, eq(tokens.scopeLagerortId, id));
  if (buch + soll + chk + bzGer + ger + flaschen + codes === 0) return { loeschbar: true };
  const teile: string[] = [];
  if (buch) teile.push(plural(buch, "Buchung", "Buchungen"));
  if (soll) teile.push(plural(soll, "Soll-Position", "Soll-Positionen"));
  if (chk) teile.push(plural(chk, "Check", "Checks"));
  if (bzGer) teile.push(plural(bzGer, "BZ-Gerät", "BZ-Geräten"));
  if (ger) teile.push(plural(ger, "Gerät", "Geräten"));
  if (flaschen) teile.push(plural(flaschen, "O₂-Flasche", "O₂-Flaschen"));
  if (codes) teile.push(plural(codes, "Zugangs-Code", "Zugangs-Codes"));
  return { loeschbar: false, grund: verknuepftGrund(teile), kannDeaktivieren: true };
}

function pruefeToken(db: DB, id: string): Loeschbarkeit {
  const t = db.select({ lastUsedAt: tokens.lastUsedAt }).from(tokens).where(eq(tokens.id, id)).get();
  if (t?.lastUsedAt) {
    return {
      loeschbar: false,
      grund: "Dieser Code wurde bereits für Buchungen benutzt und bleibt als Nachweis erhalten. Du kannst ihn stattdessen sperren.",
      kannDeaktivieren: true,
    };
  }
  return { loeschbar: true };
}

function pruefeBzGeraet(db: DB, id: string): Loeschbarkeit {
  const k = anzahl(db, bzKontrollen, eq(bzKontrollen.geraetId, id));
  if (k === 0) return { loeschbar: true };
  return { loeschbar: false, grund: verknuepftGrund([plural(k, "Kontrolle", "Kontrollen")]), kannDeaktivieren: true };
}

function pruefeO2Flasche(db: DB, id: string): Loeschbarkeit {
  const m = anzahl(db, o2Messungen, eq(o2Messungen.flascheId, id));
  if (m === 0) return { loeschbar: true };
  return { loeschbar: false, grund: verknuepftGrund([plural(m, "Messung", "Messungen")]), kannDeaktivieren: true };
}

// Geräte haben kein eigenes Historien-Table, werden aber in checks.ergebnis (freies JSON, kein FK)
// referenziert. Wurde ein Gerät je in einem Check quittiert, würde ein Hard-Delete den Namen im
// Nachweis verlieren (Zeile bliebe „gelöschtes Gerät") → wie überall: nur Deaktivieren anbieten.
function pruefeGeraet(db: DB, id: string): Loeschbarkeit {
  const n = db
    .select({ ergebnis: checks.ergebnis })
    .from(checks)
    .all()
    .filter((r) => {
      try {
        const raw = JSON.parse(r.ergebnis ?? "[]");
        return !Array.isArray(raw) && (raw.geraete ?? []).some((e: { geraetId?: string }) => e.geraetId === id);
      } catch {
        return false;
      }
    }).length;
  if (n === 0) return { loeschbar: true };
  return { loeschbar: false, grund: verknuepftGrund([plural(n, "Check", "Checks")]), kannDeaktivieren: true };
}

function pruefe(db: DB, art: ElementArt, id: string): Loeschbarkeit {
  switch (art) {
    case "artikel": return pruefeArtikel(db, id);
    case "fahrzeug": return pruefeFahrzeug(db, id);
    case "token": return pruefeToken(db, id);
    case "bzGeraet": return pruefeBzGeraet(db, id);
    case "o2Flasche": return pruefeO2Flasche(db, id);
    case "geraet": return pruefeGeraet(db, id);
  }
}

// ── Server Actions ────────────────────────────────────────────────────────────

/** Prüft, ob ein Element hart gelöscht werden darf (keine Historie). Nur lesend. */
export async function pruefeLoeschbar(art: ElementArt, id: string, db: DB = getDb()): Promise<Loeschbarkeit> {
  await requireAdmin();
  return pruefe(db, ArtSchema.parse(art), IdSchema.parse(id));
}

/**
 * Löscht ein Element endgültig — aber nur, wenn es keine Historie hat. Die Löschbarkeit wird
 * unmittelbar vor dem Löschen erneut geprüft (Schutz gegen Races zwischen Prüfung und Klick;
 * better-sqlite3 arbeitet synchron, daher genügt der Recheck auf derselben Verbindung).
 */
export async function loescheElement(art: ElementArt, id: string, db: DB = getDb()): Promise<{ geloescht: true }> {
  await requireAdmin();
  const a = ArtSchema.parse(art);
  const i = IdSchema.parse(id);
  const status = pruefe(db, a, i);
  if (!status.loeschbar) throw new Error(status.grund);
  switch (a) {
    case "artikel": db.delete(artikel).where(eq(artikel.id, i)).run(); break;
    case "fahrzeug": db.delete(lagerorte).where(and(eq(lagerorte.id, i), eq(lagerorte.typ, "fahrzeug"))).run(); break;
    case "token": db.delete(tokens).where(eq(tokens.id, i)).run(); break;
    case "bzGeraet": db.delete(bzGeraete).where(eq(bzGeraete.id, i)).run(); break;
    case "o2Flasche": db.delete(o2Flaschen).where(eq(o2Flaschen.id, i)).run(); break;
    case "geraet": db.delete(geraete).where(eq(geraete.id, i)).run(); break;
  }
  for (const p of REVALIDATE[a]) revalidatePath(p);
  return { geloescht: true };
}

/** Deaktiviert (archiviert) ein Element — die history-schonende Alternative zum Löschen. */
export async function deaktiviereElement(art: ElementArt, id: string, db: DB = getDb()): Promise<{ deaktiviert: true }> {
  await requireAdmin();
  const a = ArtSchema.parse(art);
  const i = IdSchema.parse(id);
  switch (a) {
    case "artikel": db.update(artikel).set({ aktiv: false }).where(eq(artikel.id, i)).run(); break;
    case "fahrzeug": db.update(lagerorte).set({ aktiv: false }).where(eq(lagerorte.id, i)).run(); break;
    case "token": db.update(tokens).set({ aktiv: false }).where(eq(tokens.id, i)).run(); break;
    case "bzGeraet": db.update(bzGeraete).set({ aktiv: false }).where(eq(bzGeraete.id, i)).run(); break;
    case "o2Flasche": db.update(o2Flaschen).set({ aktiv: false }).where(eq(o2Flaschen.id, i)).run(); break;
    case "geraet": db.update(geraete).set({ aktiv: false }).where(eq(geraete.id, i)).run(); break;
  }
  for (const p of REVALIDATE[a]) revalidatePath(p);
  return { deaktiviert: true };
}
