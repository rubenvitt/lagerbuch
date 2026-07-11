import { describe, expect, it, vi } from "vitest";
vi.mock("@/actions/session", () => ({ requireAdmin: async () => ({ userId: "admin1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
import { createTestDb } from "@/db/testing";
import type { DB } from "@/db";
import { lagerorte, artikel, newId } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createFahrzeug, sollPositionSetzen, sollPositionEntfernen } from "./fahrzeuge";
import { fahrzeugListe, sollFuerFahrzeug } from "@/db/queries";

function seedArtikel(db: DB) {
  const a = newId();
  db.insert(artikel).values({ id: a, name: "NaCl", einheit: "Fl.", fach: "B2", mindestbestand: 0, createdAt: new Date() }).run();
  return a;
}

describe("Fahrzeug + Soll", () => {
  it("createFahrzeug legt lagerort typ=fahrzeug an", async () => {
    const db = createTestDb();
    const { id } = await createFahrzeug({ name: "RTW 1", kennung: "XX-RK 100" }, db);
    const lo = db.select().from(lagerorte).where(eq(lagerorte.id, id)).get()!;
    expect(lo.typ).toBe("fahrzeug");
    expect(lo.name).toBe("RTW 1");
    expect(fahrzeugListe(db)).toHaveLength(1);
  });
  it("sollPositionSetzen upsert + sollFuerFahrzeug liefert Artikel-Handlagerfach", async () => {
    const db = createTestDb();
    const a = seedArtikel(db);
    const { id: fz } = await createFahrzeug({ name: "RTW 1" }, db);
    const { id: pos } = await sollPositionSetzen({ fahrzeugId: fz, fachLabel: "Schrank 1", artikelId: a, soll: 4 }, db);
    let list = sollFuerFahrzeug(db, fz);
    expect(list).toHaveLength(1);
    expect(list[0].soll).toBe(4);
    expect(list[0].artikelName).toBe("NaCl");
    expect(list[0].handlagerFach).toBe("B2");
    // update (gleiche id)
    await sollPositionSetzen({ id: pos, fahrzeugId: fz, fachLabel: "Schrank 1", artikelId: a, soll: 6 }, db);
    list = sollFuerFahrzeug(db, fz);
    expect(list).toHaveLength(1);
    expect(list[0].soll).toBe(6);
  });
  it("sollPositionEntfernen löscht die Position", async () => {
    const db = createTestDb();
    const a = seedArtikel(db);
    const { id: fz } = await createFahrzeug({ name: "RTW 1" }, db);
    const { id: pos } = await sollPositionSetzen({ fahrzeugId: fz, fachLabel: "S1", artikelId: a, soll: 2 }, db);
    await sollPositionEntfernen({ id: pos }, db);
    expect(sollFuerFahrzeug(db, fz)).toHaveLength(0);
  });
});
