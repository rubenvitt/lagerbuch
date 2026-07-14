import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/config", () => ({
  config: { helferSessionSecret: "test-secret-xxxxxxxxxxxxxxxxxxxxxxxx", helferSessionStunden: 12, nodeEnv: "development", appBaseUrl: "http://localhost:3000" },
}));
import { createTestDb } from "@/db/testing";
import { tokens, newId } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyHelferSession } from "@/lib/auth/helferSession";
import { redeemToken } from "./token-redeem";

function seedToken(db = createTestDb(), aktiv = true) {
  const id = newId();
  db.insert(tokens).values({ id, code: "831-042", label: "RTW 1", aktiv, createdAt: new Date(), createdBy: "admin1" }).run();
  return { db, id };
}

describe("redeemToken", () => {
  it("löst gültigen Code ein, setzt lastUsedAt, baut Session", async () => {
    const { db, id } = seedToken();
    const r = await redeemToken("831-042", db);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await verifyHelferSession(r.cookieValue)).toMatchObject({ tokenId: id, code: "831-042" });
    expect(db.select().from(tokens).where(eq(tokens.id, id)).get()!.lastUsedAt).not.toBeNull();
  });
  it("lehnt gesperrten Code ab, ohne lastUsedAt zu setzen", async () => {
    const { db, id } = seedToken(createTestDb(), false);
    const r = await redeemToken("831-042", db);
    expect(r.ok).toBe(false);
    expect(db.select().from(tokens).where(eq(tokens.id, id)).get()!.lastUsedAt).toBeNull();
  });
  it("lehnt unbekannten Code ab", async () => {
    const { db } = seedToken();
    expect((await redeemToken("000-000", db)).ok).toBe(false);
  });
  it("gibt das hinterlegte Ziel zurück", async () => {
    const db = createTestDb();
    db.insert(tokens).values({ id: newId(), code: "700-700", label: "RTW 1", aktiv: true, createdAt: new Date(), createdBy: "a", zielTyp: "fahrzeug", zielId: "fz9" }).run();
    const r = await redeemToken("700-700", db);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.zielTyp).toBe("fahrzeug");
    expect(r.zielId).toBe("fz9");
  });
  it("liefert null-Ziel für Codes ohne Ziel", async () => {
    const { db } = seedToken();
    const r = await redeemToken("831-042", db);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.zielTyp).toBeNull();
    expect(r.zielId).toBeNull();
  });
});
