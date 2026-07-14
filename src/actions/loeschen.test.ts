import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/testing";
import {
  artikel,
  chargen,
  lagerorte,
  tokens,
  bzGeraete,
  bzKontrollen,
  o2Flaschen,
  o2Messungen,
  newId,
} from "@/db/schema";
import { HANDLAGER_ID } from "@/db/seed-handlager";
import type { DB } from "@/db";

vi.mock("@/actions/session", () => ({ requireAdmin: async () => ({ userId: "test-admin" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { pruefeLoeschbar, loescheElement, deaktiviereElement } from "./loeschen";

function mkArtikel(db: DB, name = "Kompressen"): string {
  const id = newId();
  db.insert(artikel).values({ id, name, einheit: "Pkg.", fach: "A1", mindestbestand: 0, aktiv: true, createdAt: new Date() }).run();
  return id;
}
function mkFahrzeug(db: DB, name = "RTW 1"): string {
  const id = newId();
  db.insert(lagerorte).values({ id, name, typ: "fahrzeug", aktiv: true }).run();
  return id;
}

describe("loeschen – Artikel", () => {
  it("löscht einen Artikel ohne Historie", async () => {
    const db = createTestDb();
    const id = mkArtikel(db);
    expect(await pruefeLoeschbar("artikel", id, db)).toEqual({ loeschbar: true });
    await loescheElement("artikel", id, db);
    expect(db.select().from(artikel).where(eq(artikel.id, id)).get()).toBeUndefined();
  });

  it("sperrt das Löschen bei vorhandener Charge und bietet Deaktivieren", async () => {
    const db = createTestDb();
    const id = mkArtikel(db);
    db.insert(chargen).values({ id: newId(), artikelId: id, chargenNr: "L1", verfall: "2030-01", createdAt: new Date() }).run();

    const status = await pruefeLoeschbar("artikel", id, db);
    expect(status.loeschbar).toBe(false);
    if (!status.loeschbar) {
      expect(status.grund).toContain("Charge");
      expect(status.kannDeaktivieren).toBe(true);
    }
    await expect(loescheElement("artikel", id, db)).rejects.toThrow();

    await deaktiviereElement("artikel", id, db);
    expect(db.select().from(artikel).where(eq(artikel.id, id)).get()!.aktiv).toBe(false);
    // Artikel bleibt für den Nachweis erhalten.
    expect(db.select().from(artikel).where(eq(artikel.id, id)).get()).toBeDefined();
  });
});

describe("loeschen – Fahrzeug", () => {
  it("löscht ein Fahrzeug ohne Verknüpfungen", async () => {
    const db = createTestDb();
    const id = mkFahrzeug(db);
    expect(await pruefeLoeschbar("fahrzeug", id, db)).toEqual({ loeschbar: true });
    await loescheElement("fahrzeug", id, db);
    expect(db.select().from(lagerorte).where(eq(lagerorte.id, id)).get()).toBeUndefined();
  });

  it("sperrt das Löschen, wenn ein Zugangs-Code das Fahrzeug referenziert", async () => {
    const db = createTestDb();
    const id = mkFahrzeug(db);
    db.insert(tokens).values({ id: newId(), code: "111-222", label: "RTW", scopeLagerortId: id, aktiv: true, createdAt: new Date(), createdBy: "x" }).run();
    const status = await pruefeLoeschbar("fahrzeug", id, db);
    expect(status.loeschbar).toBe(false);
    await expect(loescheElement("fahrzeug", id, db)).rejects.toThrow();
  });

  it("lässt das Handlager niemals löschen (auch nicht deaktivierbar)", async () => {
    const db = createTestDb();
    db.insert(lagerorte).values({ id: HANDLAGER_ID, name: "Handlager", typ: "lager", aktiv: true }).run();
    const status = await pruefeLoeschbar("fahrzeug", HANDLAGER_ID, db);
    expect(status.loeschbar).toBe(false);
    if (!status.loeschbar) expect(status.kannDeaktivieren).toBe(false);
    await expect(loescheElement("fahrzeug", HANDLAGER_ID, db)).rejects.toThrow();
  });
});

describe("loeschen – Token", () => {
  it("löscht einen nie benutzten Code", async () => {
    const db = createTestDb();
    const id = newId();
    db.insert(tokens).values({ id, code: "333-444", label: "neu", aktiv: true, createdAt: new Date(), createdBy: "x" }).run();
    expect(await pruefeLoeschbar("token", id, db)).toEqual({ loeschbar: true });
    await loescheElement("token", id, db);
    expect(db.select().from(tokens).where(eq(tokens.id, id)).get()).toBeUndefined();
  });

  it("sperrt das Löschen eines bereits benutzten Codes", async () => {
    const db = createTestDb();
    const id = newId();
    db.insert(tokens).values({ id, code: "555-666", label: "benutzt", aktiv: true, createdAt: new Date(), createdBy: "x", lastUsedAt: new Date() }).run();
    const status = await pruefeLoeschbar("token", id, db);
    expect(status.loeschbar).toBe(false);
    await expect(loescheElement("token", id, db)).rejects.toThrow();
    await deaktiviereElement("token", id, db);
    expect(db.select().from(tokens).where(eq(tokens.id, id)).get()!.aktiv).toBe(false);
  });
});

describe("loeschen – BZ-Gerät & O₂-Flasche", () => {
  it("löscht ein Gerät ohne Kontrolle, sperrt mit Kontrolle", async () => {
    const db = createTestDb();
    const lager = mkFahrzeug(db, "Lager");
    const frei = newId();
    db.insert(bzGeraete).values({ id: frei, name: "Gerät A", lagerortId: lager, aktiv: true, createdAt: new Date() }).run();
    expect((await pruefeLoeschbar("bzGeraet", frei, db)).loeschbar).toBe(true);
    await loescheElement("bzGeraet", frei, db);
    expect(db.select().from(bzGeraete).where(eq(bzGeraete.id, frei)).get()).toBeUndefined();

    const mitLog = newId();
    db.insert(bzGeraete).values({ id: mitLog, name: "Gerät B", lagerortId: lager, aktiv: true, createdAt: new Date() }).run();
    db.insert(bzKontrollen).values({ id: newId(), geraetId: mitLog, ts: new Date(), quelleTyp: "oidc", quelleId: "u", bestanden: true }).run();
    expect((await pruefeLoeschbar("bzGeraet", mitLog, db)).loeschbar).toBe(false);
    await expect(loescheElement("bzGeraet", mitLog, db)).rejects.toThrow();
  });

  it("löscht eine Flasche ohne Messung, sperrt mit Messung", async () => {
    const db = createTestDb();
    const lager = mkFahrzeug(db, "Lager");
    const frei = newId();
    db.insert(o2Flaschen).values({ id: frei, name: "Flasche A", lagerortId: lager, nennfuelldruckBar: 200, aktiv: true, createdAt: new Date() }).run();
    expect((await pruefeLoeschbar("o2Flasche", frei, db)).loeschbar).toBe(true);
    await loescheElement("o2Flasche", frei, db);
    expect(db.select().from(o2Flaschen).where(eq(o2Flaschen.id, frei)).get()).toBeUndefined();

    const mitMessung = newId();
    db.insert(o2Flaschen).values({ id: mitMessung, name: "Flasche B", lagerortId: lager, nennfuelldruckBar: 200, aktiv: true, createdAt: new Date() }).run();
    db.insert(o2Messungen).values({ id: newId(), flascheId: mitMessung, ts: new Date(), druckBar: 150, quelleTyp: "oidc", quelleId: "u" }).run();
    expect((await pruefeLoeschbar("o2Flasche", mitMessung, db)).loeschbar).toBe(false);
    await expect(loescheElement("o2Flasche", mitMessung, db)).rejects.toThrow();
  });
});
