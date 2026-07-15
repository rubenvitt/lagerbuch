import { describe, expect, it, vi } from "vitest";
vi.mock("@/actions/session", () => ({ requireAdmin: async () => ({ userId: "admin1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
import { createTestDb } from "@/db/testing";
import type { DB } from "@/db";
import { lagerorte, geraete, bzGeraete, newId } from "@/db/schema";
import { eq } from "drizzle-orm";
import { geraetSpeichern, setGeraetAktiv, geraetZuBarcode } from "@/actions/geraete";
import { geraeteUebersicht, geraeteFuerLagerort, geraetById, geraetByBarcode } from "./geraete";

function seedLagerort(db: DB, name = "RTW 1", typ: "lager" | "fahrzeug" = "fahrzeug") {
  const id = newId();
  db.insert(lagerorte).values({ id, name, typ, aktiv: true }).run();
  return id;
}

describe("geraete Actions + Queries", () => {
  it("legt medizinisches Gerät an; typ-fremde Felder bleiben null", async () => {
    const db = createTestDb();
    const lo = seedLagerort(db);
    const { id } = await geraetSpeichern(
      { typ: "medizin", name: "Corpuls C3", barcode: "C3-001", lagerortId: lo, mtkFaellig: "2026-12-01", beschreibung: "ignoriert", ablaufdatum: "2027-01-01" },
      db,
    );
    const g = db.select().from(geraete).where(eq(geraete.id, id)).get()!;
    expect(g.typ).toBe("medizin");
    expect(g.mtkFaellig).toBe("2026-12-01");
    expect(g.beschreibung).toBeNull(); // typ-fremd → null
    expect(g.ablaufdatum).toBeNull();
  });

  it("legt Objekt an; MTK bleibt null", async () => {
    const db = createTestDb();
    const lo = seedLagerort(db);
    const { id } = await geraetSpeichern(
      { typ: "objekt", name: "Spineboard", lagerortId: lo, beschreibung: "mit Gurtspinne", ablaufdatum: "2030-06-01", mtkFaellig: "2026-01-01" },
      db,
    );
    const g = db.select().from(geraete).where(eq(geraete.id, id)).get()!;
    expect(g.typ).toBe("objekt");
    expect(g.beschreibung).toBe("mit Gurtspinne");
    expect(g.ablaufdatum).toBe("2030-06-01");
    expect(g.mtkFaellig).toBeNull();
  });

  it("upsert bei gesetzter id", async () => {
    const db = createTestDb();
    const lo = seedLagerort(db);
    const { id } = await geraetSpeichern({ typ: "medizin", name: "A", lagerortId: lo }, db);
    await geraetSpeichern({ id, typ: "medizin", name: "A neu", lagerortId: lo, mtkFaellig: "2026-09-09" }, db);
    const g = geraetById(db, id)!.geraet;
    expect(g.name).toBe("A neu");
    expect(g.mtkFaellig).toBe("2026-09-09");
    expect(geraeteUebersicht(db)).toHaveLength(1);
  });

  it("Barcode ist global eindeutig (geraete + bz_geraete)", async () => {
    const db = createTestDb();
    const lo = seedLagerort(db);
    await geraetSpeichern({ typ: "medizin", name: "A", barcode: "X1", lagerortId: lo }, db);
    await expect(geraetSpeichern({ typ: "objekt", name: "B", barcode: "X1", lagerortId: lo }, db)).rejects.toThrow(/bereits/);
    db.insert(bzGeraete).values({ id: newId(), name: "BZ", barcode: "BZ1", lagerortId: lo, aktiv: true, createdAt: new Date() }).run();
    await expect(geraetSpeichern({ typ: "medizin", name: "C", barcode: "BZ1", lagerortId: lo }, db)).rejects.toThrow(/BZ-Gerät/);
  });

  it("gleicher Barcode beim eigenen Update ist erlaubt", async () => {
    const db = createTestDb();
    const lo = seedLagerort(db);
    const { id } = await geraetSpeichern({ typ: "medizin", name: "A", barcode: "X1", lagerortId: lo }, db);
    await expect(geraetSpeichern({ id, typ: "medizin", name: "A2", barcode: "X1", lagerortId: lo }, db)).resolves.toMatchObject({ id });
  });

  it("geraeteFuerLagerort liefert nur aktive Geräte am Standort", async () => {
    const db = createTestDb();
    const lo1 = seedLagerort(db, "RTW 1");
    const lo2 = seedLagerort(db, "RTW 2");
    const { id: g1 } = await geraetSpeichern({ typ: "medizin", name: "A", lagerortId: lo1 }, db);
    await geraetSpeichern({ typ: "objekt", name: "B", lagerortId: lo2 }, db);
    const inaktiv = await geraetSpeichern({ typ: "objekt", name: "C", lagerortId: lo1 }, db);
    await setGeraetAktiv({ id: inaktiv.id, aktiv: false }, db);
    expect(geraeteFuerLagerort(db, lo1).map((g) => g.id)).toEqual([g1]);
  });

  it("geraetByBarcode + geraetZuBarcode (roh & Deep-Link-URL)", async () => {
    const db = createTestDb();
    const lo = seedLagerort(db);
    const { id } = await geraetSpeichern({ typ: "medizin", name: "A", barcode: "SN-9", lagerortId: lo }, db);
    expect(geraetByBarcode(db, "SN-9")).toEqual({ id });
    expect(await geraetZuBarcode("SN-9", db)).toEqual({ id });
    expect(await geraetZuBarcode("https://host/g/SN-9", db)).toEqual({ id });
    expect(await geraetZuBarcode("unbekannt", db)).toBeNull();
  });

  it("MTK-Fälligkeit fließt in die Übersicht ein", async () => {
    const db = createTestDb();
    const lo = seedLagerort(db);
    await geraetSpeichern({ typ: "medizin", name: "faellig", lagerortId: lo, mtkFaellig: "2020-01-01" }, db);
    expect(geraeteUebersicht(db)[0].faelligkeit.ueberfaellig).toBe(true);
  });
});
