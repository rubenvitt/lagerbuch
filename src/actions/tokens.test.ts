import { describe, expect, it, vi } from "vitest";
vi.mock("@/actions/session", () => ({ requireAdmin: async () => ({ userId: "admin1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
import { createTestDb } from "@/db/testing";
import { tokens } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createToken, setTokenAktiv } from "./tokens";
import { tokenListe } from "@/db/queries";

describe("createToken", () => {
  it("legt aktiven Token mit NNN-NNN-Code an", async () => {
    const db = createTestDb();
    const { id, code } = await createToken({ label: "RTW 1" }, db);
    expect(code).toMatch(/^\d{3}-\d{3}$/);
    const row = db.select().from(tokens).where(eq(tokens.id, id)).get()!;
    expect(row.aktiv).toBe(true);
    expect(row.lastUsedAt).toBeNull();
    expect(row.createdBy).toBe("admin1");
  });
  it("erzeugt eindeutige Codes", async () => {
    const db = createTestDb();
    const a = await createToken({ label: "A" }, db);
    const b = await createToken({ label: "B" }, db);
    expect(a.code).not.toBe(b.code);
  });
  it("lehnt leeres Label ab", async () => {
    await expect(createToken({ label: "  " }, createTestDb())).rejects.toThrow();
  });
});

describe("setTokenAktiv", () => {
  it("sperrt und reaktiviert", async () => {
    const db = createTestDb();
    const { id } = await createToken({ label: "A" }, db);
    await setTokenAktiv({ id, aktiv: false }, db);
    expect(db.select().from(tokens).where(eq(tokens.id, id)).get()!.aktiv).toBe(false);
    await setTokenAktiv({ id, aktiv: true }, db);
    expect(db.select().from(tokens).where(eq(tokens.id, id)).get()!.aktiv).toBe(true);
  });
});

describe("tokenListe", () => {
  it("liefert angelegte Tokens", async () => {
    const db = createTestDb();
    await createToken({ label: "A" }, db);
    expect(tokenListe(db)).toHaveLength(1);
  });
});
