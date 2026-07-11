import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/db/testing";
import { artikel, chargen, buchungen, lagerorte, newId } from "@/db/schema";
import { artikelListe, artikelDetail, artikelDetailHelfer, journalEintraege, kennzahlen } from "./queries";
import { verfallListe } from "./queries";

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

  it("splits chargenAbgelaufen (expired, rest>0) from chargenKritisch (at-risk, not expired); depleted excluded", () => {
    const db = createTestDb();
    const now = new Date();
    const lo = newId(); db.insert(lagerorte).values({ id: lo, name: "Handlager", typ: "lager" }).run();
    const a = newId(); db.insert(artikel).values({ id: a, name: "Mullbinde", einheit: "Stk.", fach: "A2", mindestbestand: 0, createdAt: now }).run();
    // abgelaufen mit rest>0 → chargenAbgelaufen, NICHT chargenKritisch
    const cLive = newId(); db.insert(chargen).values({ id: cLive, artikelId: a, chargenNr: "LIVE", verfall: "2020-01", createdAt: now }).run();
    db.insert(buchungen).values({ id: newId(), ts: now, typ: "zugang", artikelId: a, chargeId: cLive, lagerortId: lo, menge: 5, quelleTyp: "oidc", quelleId: "u1" }).run();
    // abgelaufen aber rest 0 → weder noch
    const cDep = newId(); db.insert(chargen).values({ id: cDep, artikelId: a, chargenNr: "DEP", verfall: "2019-01", createdAt: now }).run();
    db.insert(buchungen).values({ id: newId(), ts: now, typ: "zugang", artikelId: a, chargeId: cDep, lagerortId: lo, menge: 3, quelleTyp: "oidc", quelleId: "u1" }).run();
    db.insert(buchungen).values({ id: newId(), ts: now, typ: "entnahme", artikelId: a, chargeId: cDep, lagerortId: lo, menge: -3, quelleTyp: "oidc", quelleId: "u1" }).run();

    const k = kennzahlen(db);
    expect(k.chargenAbgelaufen).toBe(1); // cLive
    expect(k.chargenKritisch).toBe(0);   // cLive ist abgelaufen (zählt dort nicht), cDep rest 0
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

  it("artikelDetailHelfer omits depleted chargen and sorts remaining ones by verfall", () => {
    const { db, a, cEarly } = seed();
    const cDep = newId();
    db.insert(chargen).values({ id: cDep, artikelId: a, chargenNr: "DEP", verfall: "2021-01", createdAt: new Date() }).run();
    const lo = db.select().from(lagerorte).all()[0].id;
    db.insert(buchungen).values({ id: newId(), ts: new Date(), typ: "zugang", artikelId: a, chargeId: cDep, lagerortId: lo, menge: 2, quelleTyp: "oidc", quelleId: "u1" }).run();
    db.insert(buchungen).values({ id: newId(), ts: new Date(), typ: "entnahme", artikelId: a, chargeId: cDep, lagerortId: lo, menge: -2, quelleTyp: "oidc", quelleId: "u1" }).run();

    const d = artikelDetailHelfer(db, a)!;
    expect(d.id).toBe(a);
    expect(d.bestand).toBe(10);
    expect(d.chargen.every((c) => c.rest > 0)).toBe(true);
    expect(d.chargen.map((c) => c.id)).not.toContain(cDep);
    expect(d.chargen[0].id).toBe(cEarly); // 2026-08 sorts before 2028-01
    expect(d.chargen[0]).toHaveProperty("ampel");
    expect(d.chargen[0]).toHaveProperty("text");
  });

  it("artikelDetailHelfer returns null for unknown id", () => {
    const { db } = seed();
    expect(artikelDetailHelfer(db, "nope")).toBeNull();
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

describe("verfallListe", () => {
  function seedVerfall() {
    const db = createTestDb();
    const now = new Date();
    const lo = newId(); db.insert(lagerorte).values({ id: lo, name: "Handlager", typ: "lager" }).run();
    const a = newId(); db.insert(artikel).values({ id: a, name: "NaCl", einheit: "Fl.", fach: "B2", mindestbestand: 0, createdAt: now }).run();
    // abgelaufen, rest 5
    const cExp = newId(); db.insert(chargen).values({ id: cExp, artikelId: a, chargenNr: "EXP", verfall: "2020-01", createdAt: now }).run();
    db.insert(buchungen).values({ id: newId(), ts: now, typ: "zugang", artikelId: a, chargeId: cExp, lagerortId: lo, menge: 5, quelleTyp: "oidc", quelleId: "u1" }).run();
    // grün (weit voraus), rest 4 → NICHT in der Liste
    const cOk = newId(); db.insert(chargen).values({ id: cOk, artikelId: a, chargenNr: "OK", verfall: "2099-01", createdAt: now }).run();
    db.insert(buchungen).values({ id: newId(), ts: now, typ: "zugang", artikelId: a, chargeId: cOk, lagerortId: lo, menge: 4, quelleTyp: "oidc", quelleId: "u1" }).run();
    // Pseudo-Charge 2099-12, rest 2 → NIE in der Liste
    const cPseudo = newId(); db.insert(chargen).values({ id: cPseudo, artikelId: a, chargenNr: "PSEUDO", verfall: "2099-12", createdAt: now }).run();
    db.insert(buchungen).values({ id: newId(), ts: now, typ: "zugang", artikelId: a, chargeId: cPseudo, lagerortId: lo, menge: 2, quelleTyp: "oidc", quelleId: "u1" }).run();
    // abgelaufen aber rest 0 (drainiert) → NICHT in der Liste
    const cDep = newId(); db.insert(chargen).values({ id: cDep, artikelId: a, chargenNr: "DEP", verfall: "2019-01", createdAt: now }).run();
    db.insert(buchungen).values({ id: newId(), ts: now, typ: "zugang", artikelId: a, chargeId: cDep, lagerortId: lo, menge: 3, quelleTyp: "oidc", quelleId: "u1" }).run();
    db.insert(buchungen).values({ id: newId(), ts: now, typ: "entnahme", artikelId: a, chargeId: cDep, lagerortId: lo, menge: -3, quelleTyp: "oidc", quelleId: "u1" }).run();
    return { db, cExp };
  }

  it("listet nur rest>0 & nicht-grüne Chargen; Pseudo-Charge 2099-12 nie", () => {
    const { db, cExp } = seedVerfall();
    const list = verfallListe(db);
    expect(list).toHaveLength(1);
    expect(list[0].chargeId).toBe(cExp);
    expect(list[0].abgelaufen).toBe(true);
    expect(list[0].rest).toBe(5);
    expect(list[0].artikelName).toBe("NaCl");
    expect(list.some((e) => e.verfall === "2099-12")).toBe(false);
  });

  // Zeit einfrieren, damit rot/gelb deterministisch aus den Verfall-Monaten
  // relativ zu einem festen "jetzt" folgen (verfallListe ruft intern new Date()).
  // Schwellen (kritisch 31 / fällig 56 Tage) sind zeit-unabhängig und gelten weiter.
  afterEach(() => vi.useRealTimers());

  it("sortiert dringlichste zuerst (abgelaufen vor rot vor gelb, Tiebreak nach verfall)", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 0, 15)); // 15.01.2026
    const db = createTestDb();
    const now = new Date();
    const lo = newId(); db.insert(lagerorte).values({ id: lo, name: "Handlager", typ: "lager" }).run();
    const a = newId(); db.insert(artikel).values({ id: a, name: "X", einheit: "Stk", fach: "A1", mindestbestand: 0, createdAt: now }).run();
    // Zwei abgelaufene (Tiebreak: 2020 vor 2021), eine rote (~17 Tage), eine gelbe (~45 Tage).
    // Bewusst in verwürfelter Reihenfolge eingefügt, damit ein entfernter Tiebreak
    // bzw. ein kaputter rank() das erwartete Ergebnis verändert.
    const cGelb = newId(); db.insert(chargen).values({ id: cGelb, artikelId: a, chargenNr: "GELB", verfall: "2026-02", createdAt: now }).run();
    const cExpB = newId(); db.insert(chargen).values({ id: cExpB, artikelId: a, chargenNr: "EXP-B", verfall: "2021-01", createdAt: now }).run();
    const cRot = newId(); db.insert(chargen).values({ id: cRot, artikelId: a, chargenNr: "ROT", verfall: "2026-01", createdAt: now }).run();
    const cExpA = newId(); db.insert(chargen).values({ id: cExpA, artikelId: a, chargenNr: "EXP-A", verfall: "2020-01", createdAt: now }).run();
    for (const cid of [cGelb, cExpB, cRot, cExpA]) {
      db.insert(buchungen).values({ id: newId(), ts: now, typ: "zugang", artikelId: a, chargeId: cid, lagerortId: lo, menge: 1, quelleTyp: "oidc", quelleId: "u1" }).run();
    }

    const list = verfallListe(db);
    expect(list.map((e) => e.chargeId)).toEqual([cExpA, cExpB, cRot, cGelb]);
    expect(list.map((e) => e.abgelaufen)).toEqual([true, true, false, false]);
    expect(list.map((e) => e.ampel)).toEqual(["rot", "rot", "rot", "gelb"]);
  });
});
