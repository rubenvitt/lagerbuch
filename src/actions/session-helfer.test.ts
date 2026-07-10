import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/config", () => ({
  config: { helferSessionSecret: "test-secret-xxxxxxxxxxxxxxxxxxxxxxxx", helferSessionStunden: 12, nodeEnv: "development", appBaseUrl: "http://localhost:3000" },
}));
vi.mock("@/auth", () => ({ auth: async () => null }));
const cookieStore = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (cookieStore.has(n) ? { value: cookieStore.get(n)! } : undefined) }),
}));
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/testing";
import { tokens, newId } from "@/db/schema";
import { createHelferSession } from "@/lib/auth/helferSession";
import { requireHelfer } from "./session";

async function setup(aktiv: boolean) {
  const db = createTestDb();
  const id = newId();
  db.insert(tokens).values({ id, code: "831-042", label: "RTW 1", aktiv, createdAt: new Date(), createdBy: "admin1" }).run();
  cookieStore.set("helfer_session", await createHelferSession({ tokenId: id, code: "831-042", label: "RTW 1" }));
  return { db, id };
}

describe("requireHelfer", () => {
  it("lässt aktiven Token durch", async () => {
    const { db, id } = await setup(true);
    await expect(requireHelfer(db)).resolves.toMatchObject({ tokenId: id, code: "831-042" });
  });
  it("wirft bei gesperrtem Token (sofortige Sperrwirkung)", async () => {
    const { db } = await setup(false);
    await expect(requireHelfer(db)).rejects.toThrow();
  });
  it("wirft bei gelöschtem Token (Cookie gültig, Token-Zeile entfernt)", async () => {
    const { db, id } = await setup(true);
    db.delete(tokens).where(eq(tokens.id, id)).run();
    await expect(requireHelfer(db)).rejects.toThrow();
  });
  it("wirft ohne Cookie", async () => {
    cookieStore.clear();
    await expect(requireHelfer(createTestDb())).rejects.toThrow();
  });
});
