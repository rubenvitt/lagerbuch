import { describe, expect, it, vi } from "vitest";
vi.mock("@/actions/session", () => ({ requireAdmin: async () => ({ userId: "admin-1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/testing";
import { lagerorte, bzGeraete, bzKontrollen, geraete, newId } from "@/db/schema";
import { geraetSpeichern, setGeraetAktiv, kontrolleErfassen } from "@/actions/bz";
import {
  bzGeraeteUebersicht,
  bzGeraetDetail,
  bzGeraetByBarcode,
  bzAkkuKennzahlGesamt,
} from "./bz";

function seed() {
  const db = createTestDb();
  const lo = newId();
  db.insert(lagerorte).values({ id: lo, name: "RTW 1", typ: "fahrzeug", aktiv: true }).run();
  return { db, lo };
}

async function geraetMitLevels(db: ReturnType<typeof seed>["db"], lo: string, barcode?: string) {
  const { id } = await geraetSpeichern(
    {
      name: "Accu-Chek",
      barcode,
      lagerortId: lo,
      streifenLot: "LOT-42",
      level1Label: "Level 3",
      level1Min: 127,
      level1Max: 157,
      level2Label: "Level 4",
      level2Min: 309,
      level2Max: 387,
    },
    db,
  );
  return id;
}

describe("geraetSpeichern", () => {
  it("legt ein Gerät an und aktualisiert es", async () => {
    const { db, lo } = seed();
    const id = await geraetMitLevels(db, lo, "BC-1");
    const g = db.select().from(bzGeraete).where(eq(bzGeraete.id, id)).get()!;
    expect(g.name).toBe("Accu-Chek");
    expect(g.barcode).toBe("BC-1");
    expect(g.aktiv).toBe(true);
    expect(g.level1Min).toBe(127);

    await geraetSpeichern({ id, name: "Accu-Chek Neu", lagerortId: lo }, db);
    const g2 = db.select().from(bzGeraete).where(eq(bzGeraete.id, id)).get()!;
    expect(g2.name).toBe("Accu-Chek Neu");
    expect(g2.level1Min).toBeNull(); // nicht mitgegebene Felder werden geleert
    expect(g2.createdAt).toEqual(g.createdAt); // createdAt bleibt beim Update erhalten
  });
});

describe("kontrolleErfassen", () => {
  it("beide konfigurierten Level im Bereich → bestanden, refSnapshot eingefroren", async () => {
    const { db, lo } = seed();
    const id = await geraetMitLevels(db, lo);
    const r = await kontrolleErfassen({ geraetId: id, level1Wert: 140, level2Wert: 350 }, db);
    expect(r.bestanden).toBe(true);
    const k = db.select().from(bzKontrollen).where(eq(bzKontrollen.id, r.id)).get()!;
    expect(k.level1ImBereich).toBe(true);
    expect(k.level2ImBereich).toBe(true);
    expect(k.quelleTyp).toBe("oidc");
    expect(k.quelleId).toBe("admin-1");
    const snap = JSON.parse(k.refSnapshot!);
    expect(snap).toMatchObject({ streifenLot: "LOT-42", level1Min: 127, level2Max: 387 });
  });
  it("ein Level außerhalb → nicht bestanden", async () => {
    const { db, lo } = seed();
    const id = await geraetMitLevels(db, lo);
    const r = await kontrolleErfassen({ geraetId: id, level1Wert: 140, level2Wert: 999 }, db);
    expect(r.bestanden).toBe(false);
  });
  it("konfiguriertes Level nicht gemessen → nicht bestanden", async () => {
    const { db, lo } = seed();
    const id = await geraetMitLevels(db, lo);
    const r = await kontrolleErfassen({ geraetId: id, level1Wert: 140 }, db);
    expect(r.bestanden).toBe(false);
  });
  it("komplett leere Kontrolle → nicht bestanden, aber dokumentiert", async () => {
    const { db, lo } = seed();
    const id = await geraetMitLevels(db, lo);
    const r = await kontrolleErfassen({ geraetId: id, batterieGewechselt: true, kommentar: "nur Akku" }, db);
    expect(r.bestanden).toBe(false);
    const k = db.select().from(bzKontrollen).where(eq(bzKontrollen.id, r.id)).get()!;
    expect(k.batterieGewechselt).toBe(true);
  });
  it("refSnapshot bleibt trotz späterer Lot-Änderung am Gerät erhalten", async () => {
    const { db, lo } = seed();
    const id = await geraetMitLevels(db, lo);
    const r = await kontrolleErfassen({ geraetId: id, level1Wert: 140, level2Wert: 350 }, db);
    await geraetSpeichern({ id, name: "Accu-Chek", lagerortId: lo, streifenLot: "LOT-99" }, db);
    const k = db.select().from(bzKontrollen).where(eq(bzKontrollen.id, r.id)).get()!;
    expect(JSON.parse(k.refSnapshot!).streifenLot).toBe("LOT-42");
  });
});

describe("setGeraetAktiv", () => {
  it("deaktiviert und reaktiviert ein Gerät", async () => {
    const { db, lo } = seed();
    const id = await geraetMitLevels(db, lo);
    await setGeraetAktiv({ id, aktiv: false }, db);
    expect(db.select().from(bzGeraete).where(eq(bzGeraete.id, id)).get()!.aktiv).toBe(false);
    await setGeraetAktiv({ id, aktiv: true }, db);
    expect(db.select().from(bzGeraete).where(eq(bzGeraete.id, id)).get()!.aktiv).toBe(true);
  });
});

describe("bzGeraeteUebersicht", () => {
  it("liefert letzteKontrolle und Fälligkeit korrekt", async () => {
    const { db, lo } = seed();
    const id = await geraetMitLevels(db, lo);
    const now = new Date();
    // manuelle Kontrolle vor 10 Tagen einfügen (deterministisches ts)
    db.insert(bzKontrollen).values({
      id: newId(), geraetId: id, ts: new Date(now.getTime() - 10 * 86_400_000),
      quelleTyp: "oidc", quelleId: "admin-1", sticks: 0, lanzetten: 0, batterieGewechselt: false, bestanden: true,
    }).run();
    const zeilen = bzGeraeteUebersicht(db, now);
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0].faelligkeit.ampel).toBe("gruen");
    expect(zeilen[0].letztesBestanden).toBe(true);
    expect(zeilen[0].letzteKontrolle).not.toBeNull();
  });
  it("noch nie geprüft → rot / nieGeprueft", async () => {
    const { db, lo } = seed();
    await geraetMitLevels(db, lo);
    const zeilen = bzGeraeteUebersicht(db, new Date());
    expect(zeilen[0].faelligkeit.nieGeprueft).toBe(true);
    expect(zeilen[0].faelligkeit.ampel).toBe("rot");
  });
});

describe("bzGeraetByBarcode", () => {
  it("trifft und verfehlt", async () => {
    const { db, lo } = seed();
    const id = await geraetMitLevels(db, lo, "BC-XYZ");
    expect(bzGeraetByBarcode(db, "BC-XYZ")).toEqual({ id });
    expect(bzGeraetByBarcode(db, "unbekannt")).toBeNull();
  });
});

describe("bzGeraetDetail", () => {
  it("sortiert Logbuch absteigend und berechnet Akku-Kennzahl", async () => {
    const { db, lo } = seed();
    const id = await geraetMitLevels(db, lo);
    const base = new Date("2026-01-01T12:00:00").getTime();
    const tage = (n: number) => new Date(base + n * 86_400_000);
    // drei Batteriewechsel im 30-Tage-Raster
    for (const [i, wechsel] of [
      [0, true],
      [30, true],
      [60, true],
    ] as const) {
      db.insert(bzKontrollen).values({
        id: newId(), geraetId: id, ts: tage(i), quelleTyp: "oidc", quelleId: "admin-1",
        sticks: 0, lanzetten: 0, batterieGewechselt: wechsel, bestanden: true,
      }).run();
    }
    const d = bzGeraetDetail(db, id, tage(61))!;
    expect(d.logbuch).toHaveLength(3);
    // absteigend: neueste zuerst
    expect(d.logbuch[0].ts.getTime()).toBeGreaterThan(d.logbuch[2].ts.getTime());
    expect(d.akku.anzahlWechsel).toBe(3);
    expect(d.akku.tageDurchschnitt).toBeCloseTo(30, 0);
  });
  it("unbekannte id → null", () => {
    const { db } = seed();
    expect(bzGeraetDetail(db, "nope")).toBeNull();
  });
});

describe("bzAkkuKennzahlGesamt", () => {
  it("mittelt Intervalle nur geräteintern", async () => {
    const { db, lo } = seed();
    const g1 = await geraetMitLevels(db, lo);
    const g2 = await geraetMitLevels(db, lo);
    const base = new Date("2026-01-01T12:00:00").getTime();
    const push = (gid: string, tag: number) =>
      db.insert(bzKontrollen).values({
        id: newId(), geraetId: gid, ts: new Date(base + tag * 86_400_000),
        quelleTyp: "oidc", quelleId: "admin-1", sticks: 0, lanzetten: 0, batterieGewechselt: true, bestanden: true,
      }).run();
    push(g1, 0); push(g1, 20); // 20-Tage-Intervall
    push(g2, 0); push(g2, 40); // 40-Tage-Intervall
    const k = bzAkkuKennzahlGesamt(db);
    expect(k.anzahlIntervalle).toBe(2);
    expect(k.tageDurchschnitt).toBeCloseTo(30, 0); // (20+40)/2, KEIN geräteübergreifendes Intervall
  });
});

describe("Barcode-Namensraum geteilt mit generischen Geräten", () => {
  it("lehnt ein BZ-Gerät ab, dessen Barcode bereits einem generischen Gerät gehört", async () => {
    const { db, lo } = seed();
    db.insert(geraete).values({ id: newId(), typ: "medizin", name: "C3", barcode: "SHARED-1", lagerortId: lo, aktiv: true, createdAt: new Date() }).run();
    await expect(geraetSpeichern({ name: "Accu-Chek", barcode: "SHARED-1", lagerortId: lo }, db)).rejects.toThrow(/bereits/);
  });
});
