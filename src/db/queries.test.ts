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
});
