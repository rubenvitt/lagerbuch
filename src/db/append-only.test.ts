import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/testing";
import { artikel, chargen, lagerorte, buchungen, newId } from "@/db/schema";

function seedOneBuchung(db = createTestDb()) {
  const now = new Date();
  const lagerId = newId();
  const artId = newId();
  const chId = newId();
  const buId = newId();
  db.insert(lagerorte).values({ id: lagerId, name: "Handlager", typ: "lager" }).run();
  db.insert(artikel).values({ id: artId, name: "Mullbinde", einheit: "Stk.", fach: "A2", mindestbestand: 10, createdAt: now }).run();
  db.insert(chargen).values({ id: chId, artikelId: artId, chargenNr: "X-1", verfall: "2028-06", createdAt: now }).run();
  db.insert(buchungen).values({ id: buId, ts: now, typ: "zugang", artikelId: artId, chargeId: chId, lagerortId: lagerId, menge: 5, quelleTyp: "system", quelleId: "seed" }).run();
  return { db, buId };
}

describe("append-only journal", () => {
  it("allows inserts", () => {
    const { db } = seedOneBuchung();
    expect(db.select().from(buchungen).all()).toHaveLength(1);
  });

  it("blocks UPDATE on buchungen", () => {
    const { db, buId } = seedOneBuchung();
    expect(() =>
      db.update(buchungen).set({ menge: 99 }).where(eq(buchungen.id, buId)).run(),
    ).toThrow(/append-only/);
  });

  it("blocks DELETE on buchungen", () => {
    const { db, buId } = seedOneBuchung();
    expect(() =>
      db.delete(buchungen).where(eq(buchungen.id, buId)).run(),
    ).toThrow(/append-only/);
  });
});
