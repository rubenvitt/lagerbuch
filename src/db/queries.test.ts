import { describe, expect, it } from "vitest";
import { createTestDb } from "@/db/testing";
import { artikel, chargen, buchungen, lagerorte, newId } from "@/db/schema";
import { artikelListe, artikelDetail, journalEintraege, kennzahlen } from "./queries";

function seed() {
  const db = createTestDb();
  const now = new Date();
  const lo = newId(); db.insert(lagerorte).values({ id: lo, name: "Handlager", typ: "lager" }).run();
  const a = newId(); db.insert(artikel).values({ id: a, name: "Mullbinde", einheit: "Stk.", fach: "A2", mindestbestand: 20, createdAt: now }).run();
  const cEarly = newId(); db.insert(chargen).values({ id: cEarly, artikelId: a, chargenNr: "E", verfall: "2026-08", createdAt: now }).run();
  const cLate = newId(); db.insert(chargen).values({ id: cLate, artikelId: a, chargenNr: "L", verfall: "2028-01", createdAt: now }).run();
  db.insert(buchungen).values({ id: newId(), ts: now, typ: "zugang", artikelId: a, chargeId: cEarly, lagerortId: lo, menge: 4, quelleTyp: "oidc", quelleId: "u1" }).run();
  db.insert(buchungen).values({ id: newId(), ts: now, typ: "zugang", artikelId: a, chargeId: cLate, lagerortId: lo, menge: 6, quelleTyp: "oidc", quelleId: "u1" }).run();
  return { db, a, cEarly };
}

describe("queries", () => {
  it("artikelListe returns bestand=SUM and the earliest charge with rest", () => {
    const { db } = seed();
    const rows = artikelListe(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].bestand).toBe(10);
    expect(rows[0].naechsteCharge?.chargenNr).toBe("E"); // 2026-08 before 2028-01
  });
  it("artikelDetail returns chargen with rest and recent buchungen", () => {
    const { db, a, cEarly } = seed();
    const d = artikelDetail(db, a)!;
    expect(d.bestand).toBe(10);
    const early = d.chargen.find((c) => c.id === cEarly)!;
    expect(early.rest).toBe(4);
    expect(d.buchungen.length).toBeGreaterThanOrEqual(2);
  });
  it("kennzahlen flags under-mindestbestand", () => {
    const { db } = seed(); // bestand 10 < mindest 20
    expect(kennzahlen(db).unterMindest).toBe(1);
  });
  it("journalEintraege lists newest first with artikel name", () => {
    const { db } = seed();
    const j = journalEintraege(db, 10);
    expect(j[0].artikelName).toBe("Mullbinde");
  });

  it("chargenKritisch counts an at-risk charge with rest>0 but not a depleted one", () => {
    const db = createTestDb();
    const now = new Date();
    const lo = newId(); db.insert(lagerorte).values({ id: lo, name: "Handlager", typ: "lager" }).run();
    const a = newId(); db.insert(artikel).values({ id: a, name: "Mullbinde", einheit: "Stk.", fach: "A2", mindestbestand: 0, createdAt: now }).run();
    // live: past verfall (ampel != gruen) AND still has rest > 0 → counts
    const cLive = newId(); db.insert(chargen).values({ id: cLive, artikelId: a, chargenNr: "LIVE", verfall: "2020-01", createdAt: now }).run();
    db.insert(buchungen).values({ id: newId(), ts: now, typ: "zugang", artikelId: a, chargeId: cLive, lagerortId: lo, menge: 5, quelleTyp: "oidc", quelleId: "u1" }).run();
    // depleted: past verfall but fully removed by an entnahme → rest 0 → NOT counted
    const cDep = newId(); db.insert(chargen).values({ id: cDep, artikelId: a, chargenNr: "DEP", verfall: "2019-01", createdAt: now }).run();
    db.insert(buchungen).values({ id: newId(), ts: now, typ: "zugang", artikelId: a, chargeId: cDep, lagerortId: lo, menge: 3, quelleTyp: "oidc", quelleId: "u1" }).run();
    db.insert(buchungen).values({ id: newId(), ts: now, typ: "entnahme", artikelId: a, chargeId: cDep, lagerortId: lo, menge: -3, quelleTyp: "oidc", quelleId: "u1" }).run();

    expect(kennzahlen(db).chargenKritisch).toBe(1);
  });

  it("offeneBestellungen counts under-mindest articles only until bestelltAt is set", () => {
    const now = new Date();
    // unordered: under mindestbestand, bestelltAt null → counts
    const dbA = createTestDb();
    const loA = newId(); dbA.insert(lagerorte).values({ id: loA, name: "Handlager", typ: "lager" }).run();
    const aA = newId(); dbA.insert(artikel).values({ id: aA, name: "Pflaster", einheit: "Stk.", fach: "B1", mindestbestand: 20, bestelltAt: null, createdAt: now }).run();
    const cA = newId(); dbA.insert(chargen).values({ id: cA, artikelId: aA, chargenNr: "C", verfall: "2028-01", createdAt: now }).run();
    dbA.insert(buchungen).values({ id: newId(), ts: now, typ: "zugang", artikelId: aA, chargeId: cA, lagerortId: loA, menge: 5, quelleTyp: "oidc", quelleId: "u1" }).run();
    expect(kennzahlen(dbA).offeneBestellungen).toBe(1);

    // same but bestelltAt set → still under mindest, but no longer "offen"
    const dbB = createTestDb();
    const loB = newId(); dbB.insert(lagerorte).values({ id: loB, name: "Handlager", typ: "lager" }).run();
    const aB = newId(); dbB.insert(artikel).values({ id: aB, name: "Pflaster", einheit: "Stk.", fach: "B1", mindestbestand: 20, bestelltAt: now, createdAt: now }).run();
    const cB = newId(); dbB.insert(chargen).values({ id: cB, artikelId: aB, chargenNr: "C", verfall: "2028-01", createdAt: now }).run();
    dbB.insert(buchungen).values({ id: newId(), ts: now, typ: "zugang", artikelId: aB, chargeId: cB, lagerortId: loB, menge: 5, quelleTyp: "oidc", quelleId: "u1" }).run();
    const kB = kennzahlen(dbB);
    expect(kB.unterMindest).toBe(1);
    expect(kB.offeneBestellungen).toBe(0);
  });

  it("journalEintraege orders by ts descending", () => {
    const db = createTestDb();
    const lo = newId(); db.insert(lagerorte).values({ id: lo, name: "Handlager", typ: "lager" }).run();
    const a = newId(); db.insert(artikel).values({ id: a, name: "Mullbinde", einheit: "Stk.", fach: "A2", mindestbestand: 0, createdAt: new Date(2020, 0, 1) }).run();
    const c = newId(); db.insert(chargen).values({ id: c, artikelId: a, chargenNr: "C", verfall: "2028-01", createdAt: new Date(2020, 0, 1) }).run();
    const older = new Date(2020, 0, 1);
    const newer = new Date(2021, 0, 1);
    db.insert(buchungen).values({ id: newId(), ts: older, typ: "zugang", artikelId: a, chargeId: c, lagerortId: lo, menge: 2, quelleTyp: "oidc", quelleId: "u1", kommentar: "alt" }).run();
    db.insert(buchungen).values({ id: newId(), ts: newer, typ: "zugang", artikelId: a, chargeId: c, lagerortId: lo, menge: 3, quelleTyp: "oidc", quelleId: "u1", kommentar: "neu" }).run();

    const j = journalEintraege(db, 10);
    expect(j[0].ts.getTime()).toBe(newer.getTime());
    expect(j[0].kommentar).toBe("neu");
    expect(j[1].ts.getTime()).toBe(older.getTime());
  });
});
