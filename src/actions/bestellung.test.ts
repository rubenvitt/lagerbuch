import { describe, expect, it, vi } from "vitest";
vi.mock("@/actions/session", () => ({ requireAdmin: async () => ({ userId: "admin1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/config", () => ({ config: { bestellFaktor: 2, warnTageKritisch: 31, warnTageFaellig: 56 } }));
import { createTestDb } from "@/db/testing";
import { lagerorte, artikel, chargen, buchungen, newId } from "@/db/schema";
import { HANDLAGER_ID } from "@/db/seed-handlager";
import { eq } from "drizzle-orm";
import { markiereBestellt } from "./bestellung";
import { bestellvorschlag } from "@/db/queries";

function seed() {
  const db = createTestDb();
  const now = new Date();
  const lo = HANDLAGER_ID; db.insert(lagerorte).values({ id: lo, name: "Handlager", typ: "lager" }).run();
  // unter Mindest: bestand 2 < min 8 → vorschlag = 2*8-2 = 14
  const a = newId(); db.insert(artikel).values({ id: a, name: "NaCl", einheit: "Fl.", fach: "B2", mindestbestand: 8, createdAt: now }).run();
  const c = newId(); db.insert(chargen).values({ id: c, artikelId: a, chargenNr: "C", verfall: "2028-01", createdAt: now }).run();
  db.insert(buchungen).values({ id: newId(), ts: now, typ: "zugang", artikelId: a, chargeId: c, lagerortId: lo, menge: 2, quelleTyp: "oidc", quelleId: "u1" }).run();
  // über Mindest: bestand 5 >= min 3 → nicht in Liste
  const b = newId(); db.insert(artikel).values({ id: b, name: "Ok", einheit: "Stk", fach: "A1", mindestbestand: 3, createdAt: now }).run();
  const cb = newId(); db.insert(chargen).values({ id: cb, artikelId: b, chargenNr: "CB", verfall: "2028-01", createdAt: now }).run();
  db.insert(buchungen).values({ id: newId(), ts: now, typ: "zugang", artikelId: b, chargeId: cb, lagerortId: lo, menge: 5, quelleTyp: "oidc", quelleId: "u1" }).run();
  return { db, a };
}

describe("bestellvorschlag + markiereBestellt", () => {
  it("listet nur Artikel unter Mindest mit korrekter Vorschlagsmenge", () => {
    const { db, a } = seed();
    const list = bestellvorschlag(db);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(a);
    expect(list[0].vorschlag).toBe(14);
    expect(list[0].bestellt).toBe(false);
  });
  it("markiereBestellt setzt und löscht bestelltAt (bestellt-Flag)", async () => {
    const { db, a } = seed();
    await markiereBestellt({ artikelId: a, bestellt: true }, db);
    expect(bestellvorschlag(db)[0].bestellt).toBe(true);
    expect(db.select().from(artikel).where(eq(artikel.id, a)).get()!.bestelltAt).not.toBeNull();
    await markiereBestellt({ artikelId: a, bestellt: false }, db);
    expect(bestellvorschlag(db)[0].bestellt).toBe(false);
  });
});
