import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/testing";
import { artikel, chargen, buchungen, lagerorte, newId } from "@/db/schema";
import { HANDLAGER_ID, ensureHandlager } from "@/db/seed-handlager";
import { bestandProLagerort } from "@/lib/domain/bestand";
import { umlagerung } from "./umlagerung";

const RTW = "rtw1";

function setup() {
  const db = createTestDb();
  ensureHandlager(db);
  db.insert(lagerorte).values({ id: RTW, name: "RTW 1", typ: "fahrzeug", aktiv: true }).run();
  const art = newId();
  db.insert(artikel).values({ id: art, name: "HME", einheit: "Stk.", fach: "A2", mindestbestand: 0, bestelltAt: null, createdAt: new Date() }).run();
  const cFrueh = newId(), cSpaet = newId();
  db.insert(chargen).values({ id: cFrueh, artikelId: art, chargenNr: "F", verfall: "2026-03", createdAt: new Date() }).run();
  db.insert(chargen).values({ id: cSpaet, artikelId: art, chargenNr: "S", verfall: "2028-01", createdAt: new Date() }).run();
  const zu = (chargeId: string, menge: number) =>
    db.insert(buchungen).values({ id: newId(), ts: new Date(), typ: "zugang", artikelId: art, chargeId, lagerortId: HANDLAGER_ID, menge, quelleTyp: "oidc", quelleId: "u", referenz: null, kommentar: null }).run();
  zu(cFrueh, 3);
  zu(cSpaet, 10);
  return { db, art, cFrueh, cSpaet };
}

const rows = (db: ReturnType<typeof setup>["db"], art: string) =>
  db.select().from(buchungen).where(eq(buchungen.artikelId, art)).all().map((b) => ({ lagerortId: b.lagerortId, chargeId: b.chargeId, menge: b.menge }));
const gesamt = (db: ReturnType<typeof setup>["db"], art: string) =>
  db.select().from(buchungen).where(eq(buchungen.artikelId, art)).all().reduce((s, b) => s + b.menge, 0);

describe("umlagerung", () => {
  it("verschiebt FEFO, konserviert den Gesamtbestand und erhält die Charge auf beiden Seiten", () => {
    const { db, art, cFrueh, cSpaet } = setup();
    const vor = gesamt(db, art);
    let res!: ReturnType<typeof umlagerung>;
    db.transaction((tx) => {
      res = umlagerung(tx, { artikelId: art, menge: 5, vonLagerortId: HANDLAGER_ID, nachLagerortId: RTW, quelle: { quelleTyp: "token", quelleId: "111" }, kommentar: null, referenz: "check:x" });
    });
    expect(res.umgelagert).toBe(5);
    const r = rows(db, art);
    expect(bestandProLagerort(r, HANDLAGER_ID)).toBe(8);
    expect(bestandProLagerort(r, RTW)).toBe(5);
    expect(gesamt(db, art)).toBe(vor); // Konservierung: Netto beider Legs = 0
    // FEFO: frühe Charge zuerst voll (3), Rest aus später (2)
    const rtw = r.filter((b) => b.lagerortId === RTW);
    const summe = (cid: string) => rtw.filter((b) => b.chargeId === cid).reduce((s, b) => s + b.menge, 0);
    expect(summe(cFrueh)).toBe(3);
    expect(summe(cSpaet)).toBe(2);
  });

  it("kappt an der Quell-Verfügbarkeit", () => {
    const { db, art } = setup();
    let res!: ReturnType<typeof umlagerung>;
    db.transaction((tx) => {
      res = umlagerung(tx, { artikelId: art, menge: 99, vonLagerortId: HANDLAGER_ID, nachLagerortId: RTW, quelle: { quelleTyp: "token", quelleId: "1" }, kommentar: null, referenz: "check:y" });
    });
    expect(res.umgelagert).toBe(13);
    const r = rows(db, art);
    expect(bestandProLagerort(r, HANDLAGER_ID)).toBe(0);
    expect(bestandProLagerort(r, RTW)).toBe(13);
  });

  it("rollt bei Fehler komplett zurück (Atomarität)", () => {
    const { db, art } = setup();
    expect(() =>
      db.transaction((tx) => {
        umlagerung(tx, { artikelId: art, menge: 5, vonLagerortId: HANDLAGER_ID, nachLagerortId: RTW, quelle: { quelleTyp: "token", quelleId: "1" }, kommentar: null, referenz: "check:z" });
        throw new Error("boom");
      }),
    ).toThrow("boom");
    const r = rows(db, art);
    expect(bestandProLagerort(r, RTW)).toBe(0);
    expect(bestandProLagerort(r, HANDLAGER_ID)).toBe(13);
  });
});
