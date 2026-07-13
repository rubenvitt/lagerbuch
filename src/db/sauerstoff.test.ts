import { describe, expect, it, vi } from "vitest";
vi.mock("@/actions/session", () => ({ requireAdmin: async () => ({ userId: "admin1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
import { createTestDb } from "@/db/testing";
import type { DB } from "@/db";
import { lagerorte, o2Messungen, newId } from "@/db/schema";
import { eq } from "drizzle-orm";
import { flascheSpeichern, messungErfassen } from "@/actions/sauerstoff";
import { o2FlaschenUebersicht, o2FlascheDetail } from "./sauerstoff";

function seedLagerort(db: DB, name = "Lager A") {
  const id = newId();
  db.insert(lagerorte).values({ id, name, typ: "lager", aktiv: true }).run();
  return id;
}

describe("o2 Flaschen + Messungen", () => {
  it("flascheSpeichern legt an; leere Flasche → letzterDruck/status null", async () => {
    const db = createTestDb();
    const lo = seedLagerort(db);
    const { id } = await flascheSpeichern({ name: "O2-1", lagerortId: lo, nennfuelldruckBar: 200 }, db);
    const list = o2FlaschenUebersicht(db);
    expect(list).toHaveLength(1);
    expect(list[0].letzterDruck).toBeNull();
    expect(list[0].status).toBeNull();
    const d = o2FlascheDetail(db, id)!;
    expect(d.lagerortName).toBe("Lager A");
    expect(d.status).toBeNull();
    expect(d.verlauf).toHaveLength(0);
  });

  it("flascheSpeichern aktualisiert bei gesetzter id (upsert)", async () => {
    const db = createTestDb();
    const lo = seedLagerort(db);
    const { id } = await flascheSpeichern({ name: "O2-1", lagerortId: lo }, db);
    await flascheSpeichern({ id, name: "O2-1 neu", lagerortId: lo, nennfuelldruckBar: 300 }, db);
    const d = o2FlascheDetail(db, id)!;
    expect(d.flasche.name).toBe("O2-1 neu");
    expect(d.flasche.nennfuelldruckBar).toBe(300);
    expect(o2FlaschenUebersicht(db)).toHaveLength(1);
  });

  it("messungErfassen hängt an (append-only, Quelle = admin/oidc)", async () => {
    const db = createTestDb();
    const lo = seedLagerort(db);
    const { id } = await flascheSpeichern({ name: "O2-1", lagerortId: lo }, db);
    await messungErfassen({ flascheId: id, druckBar: 180 }, db);
    await messungErfassen({ flascheId: id, druckBar: 120, kommentar: "nachgeprüft" }, db);
    const rows = db.select().from(o2Messungen).where(eq(o2Messungen.flascheId, id)).all();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.quelleTyp === "oidc" && r.quelleId === "admin1")).toBe(true);
  });

  it("letzterDruck = jüngste Messung; verlauf absteigend; Ampel aus letztem Druck", async () => {
    const db = createTestDb();
    const lo = seedLagerort(db);
    const { id } = await flascheSpeichern({ name: "O2-1", lagerortId: lo, nennfuelldruckBar: 200 }, db);
    // Kontrollierte Zeitstempel (messungErfassen nutzt new Date() → sonst gleiche ms möglich).
    const base = new Date("2026-01-01T08:00:00Z").getTime();
    [200, 150, 40].forEach((druck, i) => {
      db.insert(o2Messungen)
        .values({ id: newId(), flascheId: id, ts: new Date(base + i * 3_600_000), druckBar: druck, quelleTyp: "oidc", quelleId: "admin1", kommentar: null })
        .run();
    });
    const list = o2FlaschenUebersicht(db);
    expect(list[0].letzterDruck).toBe(40);
    expect(list[0].status?.prozent).toBe(20);
    expect(list[0].status?.ampel).toBe("rot");
    expect(list[0].status?.niedrig).toBe(true);

    const d = o2FlascheDetail(db, id)!;
    expect(d.verlauf.map((m) => m.druckBar)).toEqual([40, 150, 200]);
    expect(d.status?.prozent).toBe(20);
  });
});
