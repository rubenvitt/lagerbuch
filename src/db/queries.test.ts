import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/db/testing";
import { artikel, chargen, buchungen, lagerorte, sollPositionen, checks, newId } from "@/db/schema";
import { HANDLAGER_ID } from "@/db/seed-handlager";
import { artikelListe, artikelDetail, artikelDetailHelfer, journalEintraege, kennzahlen } from "./queries";
import { verfallListe, fahrzeugUebersicht, checkDetail, checkHistorie } from "./queries";

function seed() {
  const db = createTestDb();
  const now = new Date();
  const lo = HANDLAGER_ID; db.insert(lagerorte).values({ id: lo, name: "Handlager", typ: "lager" }).run();
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
    const j = journalEintraege(db, { limit: 10 });
    expect(j[0].artikelName).toBe("Mullbinde");
  });

  it("splits chargenAbgelaufen (expired, rest>0) from chargenKritisch (at-risk, not expired); depleted excluded", () => {
    const db = createTestDb();
    const now = new Date();
    const lo = HANDLAGER_ID; db.insert(lagerorte).values({ id: lo, name: "Handlager", typ: "lager" }).run();
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
    const loA = HANDLAGER_ID; dbA.insert(lagerorte).values({ id: loA, name: "Handlager", typ: "lager" }).run();
    const aA = newId(); dbA.insert(artikel).values({ id: aA, name: "Pflaster", einheit: "Stk.", fach: "B1", mindestbestand: 20, bestelltAt: null, createdAt: now }).run();
    const cA = newId(); dbA.insert(chargen).values({ id: cA, artikelId: aA, chargenNr: "C", verfall: "2028-01", createdAt: now }).run();
    dbA.insert(buchungen).values({ id: newId(), ts: now, typ: "zugang", artikelId: aA, chargeId: cA, lagerortId: loA, menge: 5, quelleTyp: "oidc", quelleId: "u1" }).run();
    expect(kennzahlen(dbA).offeneBestellungen).toBe(1);

    // same but bestelltAt set → still under mindest, but no longer "offen"
    const dbB = createTestDb();
    const loB = HANDLAGER_ID; dbB.insert(lagerorte).values({ id: loB, name: "Handlager", typ: "lager" }).run();
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
    const lo = HANDLAGER_ID; db.insert(lagerorte).values({ id: lo, name: "Handlager", typ: "lager" }).run();
    const a = newId(); db.insert(artikel).values({ id: a, name: "Mullbinde", einheit: "Stk.", fach: "A2", mindestbestand: 0, createdAt: new Date(2020, 0, 1) }).run();
    const c = newId(); db.insert(chargen).values({ id: c, artikelId: a, chargenNr: "C", verfall: "2028-01", createdAt: new Date(2020, 0, 1) }).run();
    const older = new Date(2020, 0, 1);
    const newer = new Date(2021, 0, 1);
    db.insert(buchungen).values({ id: newId(), ts: older, typ: "zugang", artikelId: a, chargeId: c, lagerortId: lo, menge: 2, quelleTyp: "oidc", quelleId: "u1", kommentar: "alt" }).run();
    db.insert(buchungen).values({ id: newId(), ts: newer, typ: "zugang", artikelId: a, chargeId: c, lagerortId: lo, menge: 3, quelleTyp: "oidc", quelleId: "u1", kommentar: "neu" }).run();

    const j = journalEintraege(db, { limit: 10 });
    expect(j[0].ts.getTime()).toBe(newer.getTime());
    expect(j[0].kommentar).toBe("neu");
    expect(j[1].ts.getTime()).toBe(older.getTime());
  });
});

describe("journalEintraege Filter", () => {
  function seedJournal() {
    const db = createTestDb();
    const lo = HANDLAGER_ID; db.insert(lagerorte).values({ id: lo, name: "Handlager", typ: "lager" }).run();
    const aMull = newId(); db.insert(artikel).values({ id: aMull, name: "Mullbinde", einheit: "Stk.", fach: "A2", mindestbestand: 0, createdAt: new Date(2020, 0, 1) }).run();
    const aPfl = newId(); db.insert(artikel).values({ id: aPfl, name: "Pflaster", einheit: "Stk.", fach: "B1", mindestbestand: 0, createdAt: new Date(2020, 0, 1) }).run();
    const cMull = newId(); db.insert(chargen).values({ id: cMull, artikelId: aMull, chargenNr: "C1", verfall: "2028-01", createdAt: new Date(2020, 0, 1) }).run();
    const cPfl = newId(); db.insert(chargen).values({ id: cPfl, artikelId: aPfl, chargenNr: "C2", verfall: "2028-01", createdAt: new Date(2020, 0, 1) }).run();
    db.insert(buchungen).values({ id: newId(), ts: new Date(2020, 5, 1), typ: "zugang", artikelId: aMull, chargeId: cMull, lagerortId: lo, menge: 10, quelleTyp: "oidc", quelleId: "u1", kommentar: "Lieferung Frühjahr" }).run();
    db.insert(buchungen).values({ id: newId(), ts: new Date(2021, 5, 1), typ: "entnahme", artikelId: aMull, chargeId: cMull, lagerortId: lo, menge: -2, quelleTyp: "oidc", quelleId: "u1", kommentar: "Einsatz" }).run();
    db.insert(buchungen).values({ id: newId(), ts: new Date(2022, 5, 1), typ: "zugang", artikelId: aPfl, chargeId: cPfl, lagerortId: lo, menge: 5, quelleTyp: "oidc", quelleId: "u1", kommentar: null }).run();
    return { db };
  }

  it("filtert per Artikelname (Freitext, case-insensitive)", () => {
    const j = journalEintraege(seedJournal().db, { q: "MULL" });
    expect(j).toHaveLength(2);
    expect(j.every((e) => e.artikelName === "Mullbinde")).toBe(true);
  });
  it("filtert per Kommentar (Freitext)", () => {
    const j = journalEintraege(seedJournal().db, { q: "einsatz" });
    expect(j).toHaveLength(1);
    expect(j[0].kommentar).toBe("Einsatz");
  });
  it("filtert per Vorgangstyp", () => {
    const j = journalEintraege(seedJournal().db, { typ: "entnahme" });
    expect(j).toHaveLength(1);
    expect(j[0].typ).toBe("entnahme");
  });
  it("filtert per Zeitraum (von/bis inklusive)", () => {
    const j = journalEintraege(seedJournal().db, { von: new Date(2021, 0, 1), bis: new Date(2021, 11, 31, 23, 59, 59) });
    expect(j).toHaveLength(1);
    expect(j[0].ts.getFullYear()).toBe(2021);
  });
  it("kombiniert Filter per UND", () => {
    const j = journalEintraege(seedJournal().db, { q: "mull", typ: "zugang" });
    expect(j).toHaveLength(1);
    expect(j[0].typ).toBe("zugang");
  });
  it("sucht über die ganze Historie, nicht nur im Limit-Fenster", () => {
    // Limit 1 würde ohne WHERE nur den neuesten (Pflaster 2022) zeigen; die Suche muss dennoch
    // die älteren Mullbinde-Einträge finden (Filter greift VOR dem Limit).
    const j = journalEintraege(seedJournal().db, { q: "mull", limit: 1 });
    expect(j).toHaveLength(1);
    expect(j[0].artikelName).toBe("Mullbinde");
  });
  it("behandelt LIKE-Wildcards (%) im Freitext wörtlich (kein Over-Match)", () => {
    const db = createTestDb();
    const lo = HANDLAGER_ID; db.insert(lagerorte).values({ id: lo, name: "Handlager", typ: "lager" }).run();
    const a = newId(); db.insert(artikel).values({ id: a, name: "Glucose", einheit: "Fl.", fach: "B1", mindestbestand: 0, createdAt: new Date(2020, 0, 1) }).run();
    const c = newId(); db.insert(chargen).values({ id: c, artikelId: a, chargenNr: "C", verfall: "2028-01", createdAt: new Date(2020, 0, 1) }).run();
    db.insert(buchungen).values({ id: newId(), ts: new Date(2021, 0, 1), typ: "zugang", artikelId: a, chargeId: c, lagerortId: lo, menge: 1, quelleTyp: "oidc", quelleId: "u", kommentar: "Glucose 5%" }).run();
    db.insert(buchungen).values({ id: newId(), ts: new Date(2021, 0, 2), typ: "zugang", artikelId: a, chargeId: c, lagerortId: lo, menge: 1, quelleTyp: "oidc", quelleId: "u", kommentar: "5 Ampullen" }).run();
    // Ohne Escaping würde das Muster "%5%%" auch "5 Ampullen" matchen.
    const j = journalEintraege(db, { q: "5%" });
    expect(j).toHaveLength(1);
    expect(j[0].kommentar).toBe("Glucose 5%");
  });
});

describe("checkHistorie Filter", () => {
  function seedChecks() {
    const db = createTestDb();
    const fzA = newId(); db.insert(lagerorte).values({ id: fzA, name: "RTW 1", typ: "fahrzeug", aktiv: true }).run();
    const fzB = newId(); db.insert(lagerorte).values({ id: fzB, name: "KTW 2", typ: "fahrzeug", aktiv: true }).run();
    db.insert(checks).values({ id: newId(), fahrzeugId: fzA, quelleTyp: "token", quelleId: "t", startedAt: new Date(2020, 0, 1), completedAt: new Date(2020, 0, 1), ergebnis: "{}" }).run();
    db.insert(checks).values({ id: newId(), fahrzeugId: fzA, quelleTyp: "token", quelleId: "t", startedAt: new Date(2022, 0, 1), completedAt: new Date(2022, 0, 1), ergebnis: "{}" }).run();
    db.insert(checks).values({ id: newId(), fahrzeugId: fzB, quelleTyp: "token", quelleId: "t", startedAt: new Date(2021, 0, 1), completedAt: new Date(2021, 0, 1), ergebnis: "{}" }).run();
    return { db, fzA };
  }

  it("filtert per Fahrzeug", () => {
    const { db, fzA } = seedChecks();
    const h = checkHistorie(db, { fahrzeugId: fzA });
    expect(h).toHaveLength(2);
    expect(h.every((c) => c.fahrzeugName === "RTW 1")).toBe(true);
  });
  it("filtert per Zeitraum", () => {
    const h = checkHistorie(seedChecks().db, { von: new Date(2021, 0, 1), bis: new Date(2021, 11, 31, 23, 59, 59) });
    expect(h).toHaveLength(1);
    expect(h[0].fahrzeugName).toBe("KTW 2");
  });
});

describe("fahrzeugUebersicht", () => {
  it("verdichtet Positionen/Fächer, zählt Artikel unter Soll und den jüngsten Check", () => {
    const db = createTestDb();
    const now = new Date();
    db.insert(lagerorte).values({ id: HANDLAGER_ID, name: "Handlager", typ: "lager" }).run();
    const fz = newId();
    db.insert(lagerorte).values({ id: fz, name: "RTW 1", typ: "fahrzeug", kennung: "XX-RK 1", aktiv: true }).run();
    const a1 = newId(); db.insert(artikel).values({ id: a1, name: "NaCl", einheit: "Fl.", fach: "B2", mindestbestand: 0, createdAt: now }).run();
    const a2 = newId(); db.insert(artikel).values({ id: a2, name: "HME", einheit: "Stk.", fach: "A2", mindestbestand: 0, createdAt: now }).run();
    const c1 = newId(); db.insert(chargen).values({ id: c1, artikelId: a1, chargenNr: "C1", verfall: "2028-01", createdAt: now }).run();
    // a1: Soll 4 in zwei Fächern (S1+S2), aber nur 2 auf dem Fahrzeug → unter Soll.
    db.insert(sollPositionen).values({ id: newId(), fahrzeugId: fz, fachLabel: "S1", artikelId: a1, soll: 2, sort: 0 }).run();
    db.insert(sollPositionen).values({ id: newId(), fahrzeugId: fz, fachLabel: "S2", artikelId: a1, soll: 2, sort: 0 }).run();
    db.insert(buchungen).values({ id: newId(), ts: now, typ: "zugang", artikelId: a1, chargeId: c1, lagerortId: fz, menge: 2, quelleTyp: "system", quelleId: "s" }).run();
    // a2: Soll 1, 1 auf dem Fahrzeug → auf Soll.
    const c2 = newId(); db.insert(chargen).values({ id: c2, artikelId: a2, chargenNr: "C2", verfall: "2028-01", createdAt: now }).run();
    db.insert(sollPositionen).values({ id: newId(), fahrzeugId: fz, fachLabel: "S1", artikelId: a2, soll: 1, sort: 0 }).run();
    db.insert(buchungen).values({ id: newId(), ts: now, typ: "zugang", artikelId: a2, chargeId: c2, lagerortId: fz, menge: 1, quelleTyp: "system", quelleId: "s" }).run();

    const alt = new Date(2020, 0, 1), neu = new Date(2021, 0, 1);
    db.insert(checks).values({ id: newId(), fahrzeugId: fz, quelleTyp: "token", quelleId: "t", startedAt: alt, completedAt: alt, ergebnis: "{}" }).run();
    db.insert(checks).values({ id: newId(), fahrzeugId: fz, quelleTyp: "token", quelleId: "t", startedAt: neu, completedAt: neu, ergebnis: "{}" }).run();

    const [row] = fahrzeugUebersicht(db);
    expect(row.name).toBe("RTW 1");
    expect(row.positionen).toBe(3);
    expect(row.faecher).toBe(2); // S1, S2
    expect(row.artikelUnterSoll).toBe(1); // nur a1
    expect(row.letzterCheck?.getTime()).toBe(neu.getTime());
  });

  it("sortiert aktive vor inaktiven Fahrzeugen", () => {
    const db = createTestDb();
    db.insert(lagerorte).values({ id: newId(), name: "B-inaktiv", typ: "fahrzeug", aktiv: false }).run();
    db.insert(lagerorte).values({ id: newId(), name: "A-aktiv", typ: "fahrzeug", aktiv: true }).run();
    expect(fahrzeugUebersicht(db).map((f) => f.name)).toEqual(["A-aktiv", "B-inaktiv"]);
  });
});

describe("checkDetail", () => {
  it("reichert Positionen/Artikel des neuen ergebnis-Formats mit Namen an und summiert", () => {
    const db = createTestDb();
    const now = new Date();
    const fz = newId(); db.insert(lagerorte).values({ id: fz, name: "RTW 1", typ: "fahrzeug", kennung: "XX-RK 1", aktiv: true }).run();
    const a = newId(); db.insert(artikel).values({ id: a, name: "NaCl", einheit: "Fl.", fach: "B2", mindestbestand: 0, createdAt: now }).run();
    const pos = newId(); db.insert(sollPositionen).values({ id: pos, fahrzeugId: fz, fachLabel: "S1", artikelId: a, soll: 4, sort: 0 }).run();
    const checkId = newId();
    db.insert(checks).values({
      id: checkId, fahrzeugId: fz, quelleTyp: "token", quelleId: "111-111", startedAt: now, completedAt: now,
      ergebnis: JSON.stringify({
        positionen: [{ sollPositionId: pos, artikelId: a, soll: 4, ist: 1 }],
        artikel: [{ artikelId: a, positionen: [pos], sollSumme: 4, istSumme: 1, recordedVorher: 0, korrektur: 1, nachfuellGebucht: 3 }],
      }),
    }).run();

    const d = checkDetail(db, checkId)!;
    expect(d.fahrzeugName).toBe("RTW 1");
    expect(d.fahrzeugKennung).toBe("XX-RK 1");
    expect(d.positionen).toHaveLength(1);
    expect(d.positionen[0]).toMatchObject({ fachLabel: "S1", artikelName: "NaCl", soll: 4, ist: 1 });
    expect(d.artikel[0]).toMatchObject({ artikelName: "NaCl", korrektur: 1, nachfuellGebucht: 3, offen: 0 });
    expect(d.summe).toMatchObject({ positionen: 1, nachgefuellt: 3, korrigiert: 1, offen: 0 });
    expect(d.altFormat).toBe(false);
  });

  it("weist eine nicht (vollständig) aufgefüllte Lücke als offen aus", () => {
    const db = createTestDb();
    const now = new Date();
    const fz = newId(); db.insert(lagerorte).values({ id: fz, name: "RTW 1", typ: "fahrzeug", aktiv: true }).run();
    const a = newId(); db.insert(artikel).values({ id: a, name: "NaCl", einheit: "Fl.", fach: "B2", mindestbestand: 0, createdAt: now }).run();
    const pos = newId(); db.insert(sollPositionen).values({ id: pos, fahrzeugId: fz, fachLabel: "S1", artikelId: a, soll: 4, sort: 0 }).run();
    const checkId = newId();
    // Soll 4, gezählt 0, aber nur 1 nachgefüllt (Handlager fast leer) → 3 fehlen weiterhin.
    db.insert(checks).values({
      id: checkId, fahrzeugId: fz, quelleTyp: "token", quelleId: "t", startedAt: now, completedAt: now,
      ergebnis: JSON.stringify({
        positionen: [{ sollPositionId: pos, artikelId: a, soll: 4, ist: 0 }],
        artikel: [{ artikelId: a, positionen: [pos], sollSumme: 4, istSumme: 0, recordedVorher: 0, korrektur: 0, nachfuellGebucht: 1 }],
      }),
    }).run();
    const d = checkDetail(db, checkId)!;
    expect(d.artikel[0].offen).toBe(3);
    expect(d.summe.offen).toBe(3);
  });

  it("markiert das alte Array-Format als altFormat ohne Positionsdetails", () => {
    const db = createTestDb();
    const now = new Date();
    const fz = newId(); db.insert(lagerorte).values({ id: fz, name: "RTW 1", typ: "fahrzeug", aktiv: true }).run();
    const checkId = newId();
    db.insert(checks).values({
      id: checkId, fahrzeugId: fz, quelleTyp: "token", quelleId: "t", startedAt: now, completedAt: now,
      ergebnis: JSON.stringify([{ fehlt: 2, gebucht: 2 }]),
    }).run();
    const d = checkDetail(db, checkId)!;
    expect(d.altFormat).toBe(true);
    expect(d.positionen).toHaveLength(0);
    expect(d.artikel).toHaveLength(0);
  });

  it("gibt null für unbekannte id zurück", () => {
    expect(checkDetail(createTestDb(), "nope")).toBeNull();
  });
});

describe("checkHistorie", () => {
  it("summiert offenGesamt aus nicht aufgefüllten Lücken (neu & altes Format)", () => {
    const db = createTestDb();
    const now = new Date();
    const fz = newId(); db.insert(lagerorte).values({ id: fz, name: "RTW 1", typ: "fahrzeug", aktiv: true }).run();
    const a = newId(); db.insert(artikel).values({ id: a, name: "NaCl", einheit: "Fl.", fach: "B2", mindestbestand: 0, createdAt: now }).run();
    // neu: Soll 4, gezählt 0, nachgefüllt 1 → offen 3
    db.insert(checks).values({
      id: newId(), fahrzeugId: fz, quelleTyp: "token", quelleId: "t", startedAt: now, completedAt: new Date(2021, 0, 1),
      ergebnis: JSON.stringify({ positionen: [{ artikelId: a, soll: 4, ist: 0 }], artikel: [{ artikelId: a, sollSumme: 4, istSumme: 0, korrektur: 0, nachfuellGebucht: 1 }] }),
    }).run();
    // alt: {fehlt:2, gebucht:0} → offen 2
    db.insert(checks).values({
      id: newId(), fahrzeugId: fz, quelleTyp: "token", quelleId: "t", startedAt: now, completedAt: new Date(2020, 0, 1),
      ergebnis: JSON.stringify([{ fehlt: 2, gebucht: 0 }]),
    }).run();
    const hist = checkHistorie(db);
    expect(hist.map((h) => h.offenGesamt)).toEqual([3, 2]); // neuester zuerst
  });
});

describe("verfallListe", () => {
  function seedVerfall() {
    const db = createTestDb();
    const now = new Date();
    const lo = HANDLAGER_ID; db.insert(lagerorte).values({ id: lo, name: "Handlager", typ: "lager" }).run();
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
    const lo = HANDLAGER_ID; db.insert(lagerorte).values({ id: lo, name: "Handlager", typ: "lager" }).run();
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
