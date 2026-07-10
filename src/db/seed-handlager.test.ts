import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/testing";
import { lagerorte } from "@/db/schema";
import { ensureHandlager, HANDLAGER_ID } from "./seed-handlager";

describe("ensureHandlager", () => {
  it("creates the Handlager lagerort once and is idempotent", () => {
    const db = createTestDb();
    ensureHandlager(db);
    ensureHandlager(db);
    const rows = db.select().from(lagerorte).where(eq(lagerorte.id, HANDLAGER_ID)).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].typ).toBe("lager");
  });
});
