import { describe, expect, it, vi } from "vitest";
vi.mock("@/actions/session", () => ({ requireHelfer: async () => ({ tokenId: "t1", code: "111-111" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
import { createTestDb } from "@/db/testing";
import { lagerorte, artikel, chargen, buchungen, sollPositionen, checks, geraete, o2Flaschen, o2Messungen, newId } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensureHandlager, HANDLAGER_ID } from "@/db/seed-handlager";
import { bestandProLagerort } from "@/lib/domain/bestand";
import { checkAbschluss } from "./check";

function seed(handlagerMenge = 10) {
  const db = createTestDb();
  ensureHandlager(db);
  const fz = newId();
  db.insert(lagerorte).values({ id: fz, name: "RTW 1", typ: "fahrzeug", kennung: "XX-RK 100", aktiv: true }).run();
  const a = newId();
  db.insert(artikel).values({ id: a, name: "NaCl", einheit: "Fl.", fach: "B2", mindestbestand: 0, createdAt: new Date() }).run();
  const c = newId();
  db.insert(chargen).values({ id: c, artikelId: a, chargenNr: "C1", verfall: "2028-01", createdAt: new Date() }).run();
  db.insert(buchungen).values({ id: newId(), ts: new Date(), typ: "zugang", artikelId: a, chargeId: c, lagerortId: HANDLAGER_ID, menge: handlagerMenge, quelleTyp: "oidc", quelleId: "u1" }).run();
  const pos = newId();
  db.insert(sollPositionen).values({ id: pos, fahrzeugId: fz, fachLabel: "S1", artikelId: a, soll: 4, sort: 0 }).run();
  return { db, fz, a, pos };
}

const rows = (db: ReturnType<typeof seed>["db"], a: string) =>
  db.select().from(buchungen).where(eq(buchungen.artikelId, a)).all().map((b) => ({ lagerortId: b.lagerortId, menge: b.menge }));
const erg = (db: ReturnType<typeof seed>["db"], checkId: string) =>
  JSON.parse(db.select().from(checks).where(eq(checks.id, checkId)).get()!.ergebnis!);

describe("checkAbschluss", () => {
  it("gleicht ab (Eröffnung) und lagert die bestätigte Nachfüllmenge Handlager→Fahrzeug um", async () => {
    const { db, fz, a, pos } = seed();
    const { checkId } = await checkAbschluss({ fahrzeugId: fz, positionen: [{ sollPositionId: pos, ist: 1, nachfuellMenge: 3 }] }, db);
    const r = rows(db, a);
    expect(bestandProLagerort(r, HANDLAGER_ID)).toBe(7); // 10 − 3 umgelagert
    expect(bestandProLagerort(r, fz)).toBe(4); // 1 Eröffnung + 3 Nachfüllung = Soll
    const uml = db.select().from(buchungen).where(eq(buchungen.typ, "umlagerung")).all();
    expect(uml.length).toBe(2);
    expect(uml.every((b) => b.referenz === `check:${checkId}`)).toBe(true);
    const e = erg(db, checkId);
    expect(e.artikel[0]).toMatchObject({ artikelId: a, istSumme: 1, recordedVorher: 0, korrektur: 1, nachfuellGebucht: 3 });
    expect(e.positionen[0]).toMatchObject({ sollPositionId: pos, soll: 4, ist: 1 });
  });

  it("kappt die Nachfüllung am Handlager-Bestand (nachfuellGebucht < gewünscht)", async () => {
    const { db, fz, a, pos } = seed(2);
    const { checkId } = await checkAbschluss({ fahrzeugId: fz, positionen: [{ sollPositionId: pos, ist: 0, nachfuellMenge: 4 }] }, db);
    const r = rows(db, a);
    expect(bestandProLagerort(r, HANDLAGER_ID)).toBe(0);
    expect(bestandProLagerort(r, fz)).toBe(2);
    expect(erg(db, checkId).artikel[0]).toMatchObject({ istSumme: 0, korrektur: 0, nachfuellGebucht: 2 });
  });

  it("klemmt eine überhöhte Client-Nachfüllmenge auf Soll − Ist", async () => {
    const { db, fz, a, pos } = seed();
    const { checkId } = await checkAbschluss({ fahrzeugId: fz, positionen: [{ sollPositionId: pos, ist: 1, nachfuellMenge: 99 }] }, db);
    expect(bestandProLagerort(rows(db, a), fz)).toBe(4); // auf Soll gekappt, nicht 1+99
    expect(erg(db, checkId).artikel[0].nachfuellGebucht).toBe(3);
  });

  it("ohne Nachfüllung wird nur der Abgleich gebucht, checks-Zeile existiert", async () => {
    const { db, fz, a, pos } = seed();
    const { checkId } = await checkAbschluss({ fahrzeugId: fz, positionen: [{ sollPositionId: pos, ist: 4, nachfuellMenge: 0 }] }, db);
    expect(db.select().from(buchungen).where(eq(buchungen.typ, "umlagerung")).all()).toHaveLength(0);
    const r = rows(db, a);
    expect(bestandProLagerort(r, fz)).toBe(4); // +4 Eröffnungs-Korrektur
    expect(bestandProLagerort(r, HANDLAGER_ID)).toBe(10); // unberührt
    expect(db.select().from(checks).where(eq(checks.id, checkId)).get()).toBeTruthy();
  });

  it("aggregiert mehrere Positionen DESSELBEN Artikels korrekt (kein gegenseitiges Überschreiben)", async () => {
    // Regressionstest: derselbe Artikel in zwei Fächern teilt EINEN Fahrzeugbestand.
    const db = createTestDb();
    ensureHandlager(db);
    const fz = newId();
    db.insert(lagerorte).values({ id: fz, name: "RTW 1", typ: "fahrzeug", aktiv: true }).run();
    const a = newId();
    db.insert(artikel).values({ id: a, name: "HME", einheit: "Stk.", fach: "A2", mindestbestand: 0, createdAt: new Date() }).run();
    const c = newId();
    db.insert(chargen).values({ id: c, artikelId: a, chargenNr: "C1", verfall: "2028-01", createdAt: new Date() }).run();
    db.insert(buchungen).values({ id: newId(), ts: new Date(), typ: "zugang", artikelId: a, chargeId: c, lagerortId: HANDLAGER_ID, menge: 100, quelleTyp: "oidc", quelleId: "u" }).run();
    const p1 = newId(), p2 = newId();
    db.insert(sollPositionen).values({ id: p1, fahrzeugId: fz, fachLabel: "S1", artikelId: a, soll: 50, sort: 0 }).run();
    db.insert(sollPositionen).values({ id: p2, fahrzeugId: fz, fachLabel: "S2", artikelId: a, soll: 30, sort: 0 }).run();

    // gezählt 40 + 20 = 60; Nachfüllwunsch 10 + 10 = 20
    const { checkId } = await checkAbschluss({ fahrzeugId: fz, positionen: [
      { sollPositionId: p1, ist: 40, nachfuellMenge: 10 },
      { sollPositionId: p2, ist: 20, nachfuellMenge: 10 },
    ] }, db);
    const r = rows(db, a);
    // Fahrzeug: 60 (Eröffnung, EINMAL) + 20 (Nachfüllung) = 80 — NICHT durch Position 2 auf ~0 geclobbert
    expect(bestandProLagerort(r, fz)).toBe(80);
    expect(bestandProLagerort(r, HANDLAGER_ID)).toBe(80); // 100 − 20
    const e = erg(db, checkId);
    expect(e.artikel).toHaveLength(1); // EIN Artikel-Eintrag trotz zwei Positionen
    expect(e.artikel[0]).toMatchObject({ istSumme: 60, recordedVorher: 0, korrektur: 60, nachfuellGebucht: 20 });
    expect(e.positionen).toHaveLength(2);
  });

  it("lehnt fremde Soll-Position ab", async () => {
    const { db, fz } = seed();
    await expect(checkAbschluss({ fahrzeugId: fz, positionen: [{ sollPositionId: "nope", ist: 0, nachfuellMenge: 0 }] }, db)).rejects.toThrow();
  });

  it("Atomarität: rollt Abgleich+Nachfüllung bei späterem Fehler komplett zurück", async () => {
    const { db, fz, a, pos } = seed();
    await expect(
      checkAbschluss({ fahrzeugId: fz, positionen: [{ sollPositionId: pos, ist: 1, nachfuellMenge: 3 }, { sollPositionId: "nope", ist: 0, nachfuellMenge: 0 }] }, db),
    ).rejects.toThrow();
    const r = rows(db, a);
    expect(bestandProLagerort(r, fz)).toBe(0);
    expect(bestandProLagerort(r, HANDLAGER_ID)).toBe(10);
    expect(db.select().from(buchungen).where(eq(buchungen.typ, "umlagerung")).all()).toHaveLength(0);
    expect(db.select().from(checks).all()).toHaveLength(0);
  });
});

function seedGeraet(db: ReturnType<typeof seed>["db"], lagerortId: string, name: string, typ: "medizin" | "objekt" = "objekt") {
  const id = newId();
  db.insert(geraete).values({ id, typ, name, lagerortId, aktiv: true, createdAt: new Date() }).run();
  return id;
}

describe("checkAbschluss – Geräte", () => {
  it("quittiert Geräte und zählt auffällige (fehlt/Defekt)", async () => {
    const { db, fz, pos } = seed();
    const g1 = seedGeraet(db, fz, "C3", "medizin");
    const g2 = seedGeraet(db, fz, "Spineboard");
    const g3 = seedGeraet(db, fz, "Gurtspinne");
    const { checkId, geraeteAuffaellig } = await checkAbschluss({
      fahrzeugId: fz,
      positionen: [{ sollPositionId: pos, ist: 4, nachfuellMenge: 0 }],
      geraete: [
        { geraetId: g1, vorhanden: true, zustand: "In Ordnung" },
        { geraetId: g2, vorhanden: true, zustand: "Defekt", bemerkung: "Riss" },
        { geraetId: g3, vorhanden: false },
      ],
    }, db);
    expect(geraeteAuffaellig).toBe(2); // Defekt + fehlt
    const e = erg(db, checkId);
    expect(e.geraete).toHaveLength(3);
    expect(e.geraete[1]).toMatchObject({ geraetId: g2, vorhanden: true, zustand: "Defekt", bemerkung: "Riss" });
    expect(e.geraete[2]).toMatchObject({ geraetId: g3, vorhanden: false, zustand: null });
  });

  it("lehnt ein Gerät ab, das nicht an diesem Fahrzeug steht (Rollback)", async () => {
    const { db, fz, a, pos } = seed();
    const fremd = seedGeraet(db, HANDLAGER_ID, "fremd");
    await expect(
      checkAbschluss({ fahrzeugId: fz, positionen: [{ sollPositionId: pos, ist: 4, nachfuellMenge: 0 }], geraete: [{ geraetId: fremd, vorhanden: true, zustand: "In Ordnung" }] }, db),
    ).rejects.toThrow();
    // Rollback: keine checks-Zeile, kein Abgleich gebucht
    expect(db.select().from(checks).all()).toHaveLength(0);
    expect(bestandProLagerort(rows(db, a), fz)).toBe(0);
  });

  it("erlaubt Geräte-only-Check ohne Soll-Positionen", async () => {
    const db = createTestDb();
    ensureHandlager(db);
    const fz = newId();
    db.insert(lagerorte).values({ id: fz, name: "RTW", typ: "fahrzeug", aktiv: true }).run();
    const g = seedGeraet(db, fz, "Board");
    const { checkId } = await checkAbschluss({ fahrzeugId: fz, geraete: [{ geraetId: g, vorhanden: true, zustand: "In Ordnung" }] }, db);
    const e = erg(db, checkId);
    expect(e.geraete).toHaveLength(1);
    expect(e.positionen).toHaveLength(0);
  });
});

function seedFlasche(db: ReturnType<typeof seed>["db"], lagerortId: string, name: string, nennfuelldruckBar = 200) {
  const id = newId();
  db.insert(o2Flaschen).values({ id, name, lagerortId, nennfuelldruckBar, aktiv: true, createdAt: new Date() }).run();
  return id;
}
const messungenFuer = (db: ReturnType<typeof seed>["db"], flascheId: string) =>
  db.select().from(o2Messungen).where(eq(o2Messungen.flascheId, flascheId)).all();

describe("checkAbschluss – Sauerstoffflaschen", () => {
  it("erfasst je Flasche eine Messung und zählt niedrige (Ampel rot)", async () => {
    const { db, fz, pos } = seed();
    const voll = seedFlasche(db, fz, "O2-A");   // 200 bar Nennfülldruck
    const leer = seedFlasche(db, fz, "O2-B");
    const { checkId, flaschenAuffaellig } = await checkAbschluss({
      fahrzeugId: fz,
      positionen: [{ sollPositionId: pos, ist: 4, nachfuellMenge: 0 }],
      flaschen: [
        { flascheId: voll, druckBar: 180 }, // 90 % → ok
        { flascheId: leer, druckBar: 40 },  // 20 % → niedrig (rot)
      ],
    }, db);
    expect(flaschenAuffaellig).toBe(1);
    // Messungen sind append-only (Quelle = Token) und tragen die Check-Referenz.
    const mVoll = messungenFuer(db, voll);
    expect(mVoll).toHaveLength(1);
    expect(mVoll[0]).toMatchObject({ druckBar: 180, quelleTyp: "token", quelleId: "111-111" });
    expect(mVoll[0].kommentar).toContain(`check:${checkId}`);
    expect(messungenFuer(db, leer)[0]).toMatchObject({ druckBar: 40 });
    const e = erg(db, checkId);
    expect(e.flaschen).toHaveLength(2);
    expect(e.flaschen[0]).toMatchObject({ flascheId: voll, druckBar: 180, nennfuelldruckBar: 200 });
  });

  it("lehnt eine Flasche ab, die nicht an diesem Fahrzeug steht (Rollback)", async () => {
    const { db, fz, a, pos } = seed();
    const fremd = seedFlasche(db, HANDLAGER_ID, "fremd");
    await expect(
      checkAbschluss({ fahrzeugId: fz, positionen: [{ sollPositionId: pos, ist: 4, nachfuellMenge: 0 }], flaschen: [{ flascheId: fremd, druckBar: 150 }] }, db),
    ).rejects.toThrow();
    // Rollback: keine checks-Zeile, keine Messung, kein Abgleich gebucht
    expect(db.select().from(checks).all()).toHaveLength(0);
    expect(messungenFuer(db, fremd)).toHaveLength(0);
    expect(bestandProLagerort(rows(db, a), fz)).toBe(0);
  });

  it("erlaubt Flaschen-only-Check ohne Soll-Positionen", async () => {
    const db = createTestDb();
    ensureHandlager(db);
    const fz = newId();
    db.insert(lagerorte).values({ id: fz, name: "RTW", typ: "fahrzeug", aktiv: true }).run();
    const f = seedFlasche(db, fz, "O2");
    const { checkId } = await checkAbschluss({ fahrzeugId: fz, flaschen: [{ flascheId: f, druckBar: 200 }] }, db);
    const e = erg(db, checkId);
    expect(e.flaschen).toHaveLength(1);
    expect(e.positionen).toHaveLength(0);
    expect(messungenFuer(db, f)).toHaveLength(1);
  });
});
