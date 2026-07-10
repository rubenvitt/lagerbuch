import { describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/db/testing";
import { artikel } from "@/db/schema";
import { eq } from "drizzle-orm";

vi.mock("@/actions/session", () => ({ requireAdmin: async () => ({ userId: "test-admin" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createArtikel, updateArtikel } from "./artikel";

describe("artikel actions", () => {
  it("creates an active article", async () => {
    const db = createTestDb();
    const { id } = await createArtikel({ name: "Kompressen", einheit: "Pkg.", fach: "A3", mindestbestand: 30 }, db);
    const row = db.select().from(artikel).where(eq(artikel.id, id)).get()!;
    expect(row.name).toBe("Kompressen");
    expect(row.aktiv).toBe(true);
  });
  it("updates stammdaten", async () => {
    const db = createTestDb();
    const { id } = await createArtikel({ name: "X", einheit: "Stk.", fach: "A1", mindestbestand: 5 }, db);
    await updateArtikel(id, { mindestbestand: 12, fach: "B1" }, db);
    const row = db.select().from(artikel).where(eq(artikel.id, id)).get()!;
    expect(row.mindestbestand).toBe(12);
    expect(row.fach).toBe("B1");
  });
  it("rejects an empty name", async () => {
    const db = createTestDb();
    await expect(createArtikel({ name: "", einheit: "Stk.", fach: "A1", mindestbestand: 5 }, db)).rejects.toThrow();
  });
});
