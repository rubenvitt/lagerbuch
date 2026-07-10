import { describe, expect, it, vi } from "vitest";
vi.mock("@/actions/session", () => ({ requireAdmin: async () => ({ userId: "admin1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
import { createTestDb } from "@/db/testing";
import { artikel, chargen, buchungen, newId } from "@/db/schema";
import { eq } from "drizzle-orm";
import { bestand } from "@/lib/domain/bestand";
import { ensureHandlager } from "@/db/seed-handlager";
import { bucheZugang } from "./buchung";

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
});
