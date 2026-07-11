import { describe, expect, it, vi } from "vitest";
vi.mock("@/actions/session", () => ({ requireHelfer: async () => ({ tokenId: "t1", code: "111-111" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
import { createTestDb } from "@/db/testing";
import { lagerorte, artikel, chargen, buchungen, sollPositionen, checks, newId } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensureHandlager, HANDLAGER_ID } from "@/db/seed-handlager";
import { bestand } from "@/lib/domain/bestand";
import { checkAbschluss } from "./check";

function seed() {
  const db = createTestDb();
  ensureHandlager(db);
  const fz = newId();
  db.insert(lagerorte).values({ id: fz, name: "RTW 1", typ: "fahrzeug", kennung: "XX-RK 100", aktiv: true }).run();
  const a = newId();
  db.insert(artikel).values({ id: a, name: "NaCl", einheit: "Fl.", fach: "B2", mindestbestand: 0, createdAt: new Date() }).run();
  const c = newId();
  db.insert(chargen).values({ id: c, artikelId: a, chargenNr: "C1", verfall: "2028-01", createdAt: new Date() }).run();
  db.insert(buchungen).values({ id: newId(), ts: new Date(), typ: "zugang", artikelId: a, chargeId: c, lagerortId: HANDLAGER_ID, menge: 10, quelleTyp: "oidc", quelleId: "u1" }).run();
  const pos = newId();
  db.insert(sollPositionen).values({ id: pos, fahrzeugId: fz, fachLabel: "S1", artikelId: a, soll: 4, sort: 0 }).run();
  return { db, fz, a, pos };
}

describe("checkAbschluss", () => {
  it("bucht je Fehlmenge FEFO-Entnahme mit referenz=check:<id>, erzeugt checks-Zeile", async () => {
    const { db, fz, a, pos } = seed();
    const { checkId } = await checkAbschluss({ fahrzeugId: fz, positionen: [{ sollPositionId: pos, ist: 1 }] }, db);
    // Fehlmenge 3 → entnahme -3 mit referenz
    const entn = db.select().from(buchungen).where(eq(buchungen.typ, "entnahme")).all();
    expect(entn).toHaveLength(1);
    expect(entn[0].menge).toBe(-3);
    expect(entn[0].referenz).toBe(`check:${checkId}`);
    expect(entn[0].quelleTyp).toBe("token");
    // Handlager-Bestand 10 → 7
    const bu = db.select().from(buchungen).where(eq(buchungen.artikelId, a)).all();
    expect(bestand(bu.map((b) => ({ menge: b.menge })))).toBe(7);
    // checks-Zeile + ergebnis
    const chk = db.select().from(checks).where(eq(checks.id, checkId)).get()!;
    expect(chk.fahrzeugId).toBe(fz);
    const erg = JSON.parse(chk.ergebnis!);
    expect(erg[0]).toMatchObject({ sollPositionId: pos, soll: 4, ist: 1, fehlt: 3, gebucht: 3 });
  });
  it("kappt gebucht am Handlager-Bestand (gebucht < fehlt)", async () => {
    const { db, fz, a, pos } = seed();
    // Bestand auf 2 reduzieren
    db.insert(buchungen).values({ id: newId(), ts: new Date(), typ: "entnahme", artikelId: a, chargeId: db.select().from(chargen).where(eq(chargen.artikelId, a)).get()!.id, lagerortId: HANDLAGER_ID, menge: -8, quelleTyp: "oidc", quelleId: "u1" }).run();
    const { checkId } = await checkAbschluss({ fahrzeugId: fz, positionen: [{ sollPositionId: pos, ist: 0 }] }, db);
    const erg = JSON.parse(db.select().from(checks).where(eq(checks.id, checkId)).get()!.ergebnis!);
    expect(erg[0]).toMatchObject({ soll: 4, ist: 0, fehlt: 4, gebucht: 2 }); // nur 2 im Lager
  });
  it("keine Fehlmenge → keine Entnahme, aber checks-Zeile existiert", async () => {
    const { db, fz, pos } = seed();
    const { checkId } = await checkAbschluss({ fahrzeugId: fz, positionen: [{ sollPositionId: pos, ist: 4 }] }, db);
    expect(db.select().from(buchungen).where(eq(buchungen.typ, "entnahme")).all()).toHaveLength(0);
    expect(db.select().from(checks).where(eq(checks.id, checkId)).get()).toBeTruthy();
  });
  it("lehnt fremde Soll-Position ab", async () => {
    const { db, fz } = seed();
    await expect(checkAbschluss({ fahrzeugId: fz, positionen: [{ sollPositionId: "nope", ist: 0 }] }, db)).rejects.toThrow();
  });
  it("Atomarität (alles-oder-nichts): rollt eine bereits gebuchte Teil-Entnahme bei späterem Fehler zurück", async () => {
    const { db, fz, pos } = seed();
    // Erste Position (gültig, Fehlmenge 3 → bucht Entnahme), zweite Position (fremd → wirft).
    await expect(
      checkAbschluss({ fahrzeugId: fz, positionen: [{ sollPositionId: pos, ist: 1 }, { sollPositionId: "nope", ist: 0 }] }, db),
    ).rejects.toThrow();
    // Rollback: weder Entnahme noch checks-Zeile dürfen persistiert sein.
    expect(db.select().from(buchungen).where(eq(buchungen.typ, "entnahme")).all()).toHaveLength(0);
    expect(db.select().from(checks).all()).toHaveLength(0);
  });
});
