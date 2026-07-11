import { describe, expect, it, vi } from "vitest";
vi.mock("@/actions/session", () => ({ requireAdmin: async () => ({ userId: "admin1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/config", () => ({ config: { warnTageKritisch: 31, warnTageFaellig: 56 } }));
import { createTestDb } from "@/db/testing";
import { artikel, chargen, buchungen, newId } from "@/db/schema";
import { eq } from "drizzle-orm";
import { bestand } from "@/lib/domain/bestand";
import { ensureHandlager, HANDLAGER_ID } from "@/db/seed-handlager";
import { aussondern } from "./aussondern";

function seed({ verfall = "2020-01", menge = 5, bestelltAt = null as Date | null } = {}) {
  const db = createTestDb();
  ensureHandlager(db);
  const aId = newId();
  db.insert(artikel).values({ id: aId, name: "NaCl", einheit: "Fl.", fach: "B2", mindestbestand: 0, bestelltAt, createdAt: new Date() }).run();
  const cId = newId();
  db.insert(chargen).values({ id: cId, artikelId: aId, chargenNr: "C1", verfall, createdAt: new Date() }).run();
  if (menge > 0) db.insert(buchungen).values({ id: newId(), ts: new Date(), typ: "zugang", artikelId: aId, chargeId: cId, lagerortId: HANDLAGER_ID, menge, quelleTyp: "oidc", quelleId: "u1" }).run();
  return { db, aId, cId };
}

describe("aussondern", () => {
  it("bucht -rest als korrektur; Artikel-Bestand sinkt auf 0", async () => {
    const { db, aId, cId } = seed({ verfall: "2020-01", menge: 5 });
    await aussondern({ chargeId: cId, kommentar: "abgelaufen 01/2020" }, db);
    const bu = db.select().from(buchungen).where(eq(buchungen.artikelId, aId)).all();
    const korr = bu.find((b) => b.typ === "korrektur")!;
    expect(korr.menge).toBe(-5);
    expect(korr.kommentar).toBe("abgelaufen 01/2020");
    expect(korr.quelleTyp).toBe("oidc");
    expect(bestand(bu.map((b) => ({ menge: b.menge })))).toBe(0);
  });
  it("erzwingt Pflicht-Kommentar", async () => {
    const { db, cId } = seed();
    await expect(aussondern({ chargeId: cId, kommentar: "  " }, db)).rejects.toThrow();
  });
  it("lehnt Charge ohne Restbestand ab", async () => {
    const { db, cId } = seed({ verfall: "2020-01", menge: 0 });
    await expect(aussondern({ chargeId: cId, kommentar: "x" }, db)).rejects.toThrow(/Restbestand/);
  });
  it("lehnt nicht-abgelaufene Charge ab", async () => {
    const { db, cId } = seed({ verfall: "2099-01", menge: 5 });
    await expect(aussondern({ chargeId: cId, kommentar: "x" }, db)).rejects.toThrow(/abgelaufen/);
  });
  it("lehnt die Pseudo-Charge 2099-12 ab (immer grün)", async () => {
    const { db, cId } = seed({ verfall: "2099-12", menge: 5 });
    await expect(aussondern({ chargeId: cId, kommentar: "x" }, db)).rejects.toThrow(/abgelaufen/);
  });
  it("lehnt unbekannte Charge ab", async () => {
    const { db } = seed();
    await expect(aussondern({ chargeId: "nope", kommentar: "x" }, db)).rejects.toThrow();
  });
  it("lässt bestelltAt unverändert", async () => {
    const bestellt = new Date("2026-01-01");
    const { db, aId, cId } = seed({ verfall: "2020-01", menge: 5, bestelltAt: bestellt });
    await aussondern({ chargeId: cId, kommentar: "x" }, db);
    expect(db.select().from(artikel).where(eq(artikel.id, aId)).get()!.bestelltAt?.getTime()).toBe(bestellt.getTime());
  });
});
