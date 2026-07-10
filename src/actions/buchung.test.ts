import { describe, expect, it, vi } from "vitest";
vi.mock("@/actions/session", () => ({ requireAdmin: async () => ({ userId: "admin1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
import { createTestDb } from "@/db/testing";
import { artikel, chargen, buchungen, newId } from "@/db/schema";
import { eq } from "drizzle-orm";
import { bestand } from "@/lib/domain/bestand";
import { ensureHandlager } from "@/db/seed-handlager";
import { bucheZugang, bucheEntnahme } from "./buchung";

function seedArtikel(db = createTestDb()) {
  // The FK on buchungen.lagerortId requires the Handlager lagerort to exist;
  // in production this is seeded once at startup (src/instrumentation.ts),
  // but a fresh in-memory test db needs it seeded explicitly.
  ensureHandlager(db);
  const id = newId();
  db.insert(artikel).values({ id, name: "NaCl", einheit: "Fl.", fach: "B2", mindestbestand: 8, bestelltAt: new Date(), createdAt: new Date() }).run();
  return { db, id };
}

describe("bucheZugang", () => {
  it("creates a new charge and books +menge", async () => {
    const { db, id } = seedArtikel();
    await bucheZugang({ artikelId: id, menge: 5, neueCharge: { chargenNr: "N1", verfall: "2028-06" } }, db);
    expect(db.select().from(chargen).where(eq(chargen.artikelId, id)).all()).toHaveLength(1);
    const bu = db.select().from(buchungen).where(eq(buchungen.artikelId, id)).all();
    expect(bestand(bu.map((b) => ({ menge: b.menge })))).toBe(5);
  });
  it("clears bestelltAt on zugang", async () => {
    const { db, id } = seedArtikel();
    await bucheZugang({ artikelId: id, menge: 3, neueCharge: { chargenNr: "N", verfall: "2099-12" } }, db);
    expect(db.select().from(artikel).where(eq(artikel.id, id)).get()!.bestelltAt).toBeNull();
  });
  it("books +menge onto an existing charge of the same article", async () => {
    const { db, id } = seedArtikel();
    await bucheZugang({ artikelId: id, menge: 3, neueCharge: { chargenNr: "N1", verfall: "2028-06" } }, db);
    const charge = db.select().from(chargen).where(eq(chargen.artikelId, id)).get()!;
    await bucheZugang({ artikelId: id, menge: 4, chargeId: charge.id }, db);
    expect(db.select().from(chargen).where(eq(chargen.artikelId, id)).all()).toHaveLength(1);
    const bu = db.select().from(buchungen).where(eq(buchungen.artikelId, id)).all();
    expect(bestand(bu.map((b) => ({ menge: b.menge })))).toBe(7);
  });
  it("rejects a chargeId that belongs to a different article", async () => {
    const { db, id } = seedArtikel();
    const otherId = newId();
    db.insert(artikel).values({ id: otherId, name: "Andere", einheit: "Stk", fach: "A1", mindestbestand: 1, bestelltAt: null, createdAt: new Date() }).run();
    const foreignChargeId = newId();
    db.insert(chargen).values({ id: foreignChargeId, artikelId: otherId, chargenNr: "F1", verfall: "2027-01", createdAt: new Date() }).run();
    await expect(bucheZugang({ artikelId: id, menge: 5, chargeId: foreignChargeId }, db)).rejects.toThrow();
    // no phantom booking should have landed on either article
    const bu = db.select().from(buchungen).where(eq(buchungen.artikelId, id)).all();
    expect(bu).toHaveLength(0);
  });
  it("rejects when both chargeId and neueCharge are given", async () => {
    const { db, id } = seedArtikel();
    await expect(
      bucheZugang({ artikelId: id, menge: 1, chargeId: newId(), neueCharge: { chargenNr: "X", verfall: "2028-01" } }, db),
    ).rejects.toThrow();
  });
  it("rejects when neither chargeId nor neueCharge is given", async () => {
    const { db, id } = seedArtikel();
    await expect(bucheZugang({ artikelId: id, menge: 1 }, db)).rejects.toThrow();
  });
  it("rejects menge: 0", async () => {
    const { db, id } = seedArtikel();
    await expect(
      bucheZugang({ artikelId: id, menge: 0, neueCharge: { chargenNr: "Z", verfall: "2028-01" } }, db),
    ).rejects.toThrow();
  });
});

describe("bucheEntnahme", () => {
  it("entnahme distributes FEFO and caps at Bestand", async () => {
    const { db, id } = seedArtikel();
    await bucheZugang({ artikelId: id, menge: 3, neueCharge: { chargenNr: "E", verfall: "2026-08" } }, db);
    await bucheZugang({ artikelId: id, menge: 10, neueCharge: { chargenNr: "L", verfall: "2028-01" } }, db);
    const { gebucht } = await bucheEntnahme({ artikelId: id, menge: 5 }, db);
    expect(gebucht).toBe(5);
    // earliest charge fully drained (3), later charge -2 → bestand 8
    const bu = db.select().from(buchungen).where(eq(buchungen.artikelId, id)).all();
    expect(bestand(bu.map((b) => ({ menge: b.menge })))).toBe(8);
  });
  it("caps entnahme at available Bestand", async () => {
    const { db, id } = seedArtikel();
    await bucheZugang({ artikelId: id, menge: 3, neueCharge: { chargenNr: "E", verfall: "2026-08" } }, db);
    const { gebucht } = await bucheEntnahme({ artikelId: id, menge: 99 }, db);
    expect(gebucht).toBe(3);
  });
  it("rejects menge: 0", async () => {
    const { db, id } = seedArtikel();
    await expect(bucheEntnahme({ artikelId: id, menge: 0 }, db)).rejects.toThrow();
  });
});
