import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/testing";
import { artikel, chargen, buchungen, lagerorte, newId } from "@/db/schema";
import { HANDLAGER_ID, ensureHandlager } from "@/db/seed-handlager";
import { bestandProLagerort } from "@/lib/domain/bestand";
import { umlagerung } from "./umlagerung";
import { korrekturAufLagerort } from "./korrektur";

const RTW = "rtw1";
const Q = { quelleTyp: "token" as const, quelleId: "111" };

function setup(opts: { mitChargen?: boolean; handlagerMenge?: number } = {}) {
  const { mitChargen = true, handlagerMenge = 10 } = opts;
  const db = createTestDb();
  ensureHandlager(db);
  db.insert(lagerorte).values({ id: RTW, name: "RTW 1", typ: "fahrzeug", aktiv: true }).run();
  const art = newId();
  db.insert(artikel).values({ id: art, name: "HME", einheit: "Stk.", fach: "A2", mindestbestand: 0, bestelltAt: null, createdAt: new Date() }).run();
  if (mitChargen) {
    const c = newId();
    db.insert(chargen).values({ id: c, artikelId: art, chargenNr: "F", verfall: "2027-06", createdAt: new Date() }).run();
    db.insert(buchungen).values({ id: newId(), ts: new Date(), typ: "zugang", artikelId: art, chargeId: c, lagerortId: HANDLAGER_ID, menge: handlagerMenge, quelleTyp: "oidc", quelleId: "u", referenz: null, kommentar: null }).run();
  }
  return { db, art };
}

const rows = (db: ReturnType<typeof setup>["db"], art: string) =>
  db.select().from(buchungen).where(eq(buchungen.artikelId, art)).all().map((b) => ({ lagerortId: b.lagerortId, menge: b.menge }));

describe("korrekturAufLagerort", () => {
  it("ist ein No-Op wenn ist === recorded", () => {
    const { db, art } = setup();
    let res!: ReturnType<typeof korrekturAufLagerort>;
    db.transaction((tx) => {
      res = korrekturAufLagerort(tx, { artikelId: art, lagerortId: RTW, istMenge: 0, quelle: Q, kommentar: null, referenz: "check:x" });
    });
    expect(res.diff).toBe(0);
    expect(db.select().from(buchungen).where(eq(buchungen.lagerortId, RTW)).all()).toHaveLength(0);
  });

  it("diff<0: bucht -delta FEFO über die Chargen DIESES Lagerorts, Ergebnis = ist", () => {
    const { db, art } = setup();
    // RTW zunächst auf 5 bringen (Umlagerung aus Handlager)
    db.transaction((tx) => umlagerung(tx, { artikelId: art, menge: 5, vonLagerortId: HANDLAGER_ID, nachLagerortId: RTW, quelle: Q, kommentar: null, referenz: "seed" }));
    const handlagerVor = bestandProLagerort(rows(db, art), HANDLAGER_ID);
    let res!: ReturnType<typeof korrekturAufLagerort>;
    db.transaction((tx) => {
      res = korrekturAufLagerort(tx, { artikelId: art, lagerortId: RTW, istMenge: 3, quelle: Q, kommentar: "gezählt", referenz: "check:y" });
    });
    expect(res.diff).toBe(-2);
    expect(bestandProLagerort(rows(db, art), RTW)).toBe(3);
    // die Korrektur betrifft NUR das Fahrzeug, der Handlager bleibt unberührt
    expect(bestandProLagerort(rows(db, art), HANDLAGER_ID)).toBe(handlagerVor);
  });

  it("diff>0: bucht +delta auf eine bestehende Charge, Ergebnis = ist", () => {
    const { db, art } = setup();
    let res!: ReturnType<typeof korrekturAufLagerort>;
    db.transaction((tx) => {
      res = korrekturAufLagerort(tx, { artikelId: art, lagerortId: RTW, istMenge: 4, quelle: Q, kommentar: "eröffnung", referenz: "check:z" });
    });
    expect(res.diff).toBe(4);
    expect(res.chargeId).not.toBeNull();
    expect(bestandProLagerort(rows(db, art), RTW)).toBe(4);
  });

  it("diff>0 ohne existierende Charge: legt eine Dummy-Charge an", () => {
    const { db, art } = setup({ mitChargen: false });
    db.transaction((tx) => {
      korrekturAufLagerort(tx, { artikelId: art, lagerortId: RTW, istMenge: 3, quelle: Q, kommentar: null, referenz: "check:d" });
    });
    expect(db.select().from(chargen).where(eq(chargen.artikelId, art)).all()).toHaveLength(1);
    expect(bestandProLagerort(rows(db, art), RTW)).toBe(3);
  });
});
