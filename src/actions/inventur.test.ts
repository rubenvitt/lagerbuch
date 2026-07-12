import { describe, expect, it, vi } from "vitest";
vi.mock("@/actions/session", () => ({ requireAdmin: async () => ({ userId: "admin1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
import { createTestDb } from "@/db/testing";
import { artikel, chargen, buchungen, newId } from "@/db/schema";
import { eq } from "drizzle-orm";
import { bestand } from "@/lib/domain/bestand";
import { ensureHandlager, HANDLAGER_ID } from "@/db/seed-handlager";
import { inventurKorrektur } from "./inventur";
import type { DB } from "@/db";

function seedArtikel(db: DB, { mindest = 0, bestelltAt = null as Date | null } = {}) {
  const a = newId();
  db.insert(artikel).values({ id: a, name: "NaCl", einheit: "Fl.", fach: "B2", mindestbestand: mindest, bestelltAt, createdAt: new Date() }).run();
  return a;
}
function zugang(db: DB, a: string, menge: number, verfall: string, createdAt = new Date()) {
  const c = newId();
  db.insert(chargen).values({ id: c, artikelId: a, chargenNr: `C-${verfall}`, verfall, createdAt }).run();
  db.insert(buchungen).values({ id: newId(), ts: new Date(), typ: "zugang", artikelId: a, chargeId: c, lagerortId: HANDLAGER_ID, menge, quelleTyp: "oidc", quelleId: "u1" }).run();
  return c;
}
function bestandOf(db: DB, a: string) { return bestand(db.select().from(buchungen).where(eq(buchungen.artikelId, a)).all().map((b) => ({ menge: b.menge }))); }

describe("inventurKorrektur — Invariante bestand===ist", () => {
  it("ist<bestand über mehrere Chargen (FEFO korrektur)", async () => {
    const db = createTestDb(); ensureHandlager(db);
    const a = seedArtikel(db);
    zugang(db, a, 3, "2026-08"); zugang(db, a, 5, "2028-01"); // bestand 8
    await inventurKorrektur({ kommentar: "gezählt", positionen: [{ artikelId: a, ist: 6 }] }, db);
    expect(bestandOf(db, a)).toBe(6);
    const korr = db.select().from(buchungen).where(eq(buchungen.typ, "korrektur")).all();
    expect(korr.every((k) => k.referenz?.startsWith("inventur:"))).toBe(true);
    expect(korr.every((k) => k.menge < 0)).toBe(true);
  });
  it("ist>bestand auf jüngste Charge", async () => {
    const db = createTestDb(); ensureHandlager(db);
    const a = seedArtikel(db);
    const cOld = zugang(db, a, 2, "2026-08"); const cNew = zugang(db, a, 2, "2028-01"); // bestand 4, jüngste = cNew
    await inventurKorrektur({ kommentar: "gezählt", positionen: [{ artikelId: a, ist: 7 }] }, db);
    expect(bestandOf(db, a)).toBe(7);
    const korr = db.select().from(buchungen).where(eq(buchungen.typ, "korrektur")).get()!;
    expect(korr.menge).toBe(3);
    expect(korr.chargeId).toBe(cNew); // jüngste (max verfall)
    void cOld;
  });
  it("ist>bestand bei Artikel OHNE Charge → neue 2099-12-Charge", async () => {
    const db = createTestDb(); ensureHandlager(db);
    const a = seedArtikel(db); // keine Charge, bestand 0
    await inventurKorrektur({ kommentar: "erstzählung", positionen: [{ artikelId: a, ist: 5 }] }, db);
    expect(bestandOf(db, a)).toBe(5);
    const ch = db.select().from(chargen).where(eq(chargen.artikelId, a)).all();
    expect(ch).toHaveLength(1);
    expect(ch[0].verfall).toBe("2099-12");
  });
  it("ist==bestand → keine Buchung", async () => {
    const db = createTestDb(); ensureHandlager(db);
    const a = seedArtikel(db); zugang(db, a, 4, "2028-01");
    await inventurKorrektur({ kommentar: "x", positionen: [{ artikelId: a, ist: 4 }] }, db);
    expect(db.select().from(buchungen).where(eq(buchungen.typ, "korrektur")).all()).toHaveLength(0);
  });
  it("erzwingt Pflicht-Kommentar", async () => {
    const db = createTestDb(); ensureHandlager(db);
    const a = seedArtikel(db); zugang(db, a, 4, "2028-01");
    await expect(inventurKorrektur({ kommentar: "  ", positionen: [{ artikelId: a, ist: 2 }] }, db)).rejects.toThrow();
  });
  it("lässt bestelltAt unverändert", async () => {
    const db = createTestDb(); ensureHandlager(db);
    const bestellt = new Date("2026-01-01");
    const a = seedArtikel(db, { bestelltAt: bestellt }); zugang(db, a, 4, "2028-01");
    await inventurKorrektur({ kommentar: "x", positionen: [{ artikelId: a, ist: 2 }] }, db);
    expect(db.select().from(artikel).where(eq(artikel.id, a)).get()!.bestelltAt?.getTime()).toBe(bestellt.getTime());
  });
});
