import { describe, expect, it, vi } from "vitest";
vi.mock("@/actions/session", () => ({ requireAdmin: async () => ({ userId: "admin1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
import { createTestDb } from "@/db/testing";
import { tokens, lagerorte, artikel, newId } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createToken, setTokenAktiv } from "./tokens";
import { tokenListe } from "@/db/queries";

function seedZiele(db: ReturnType<typeof createTestDb>) {
  const fz = newId();
  db.insert(lagerorte).values({ id: fz, name: "RTW 1", typ: "fahrzeug", kennung: "XX-RK 1", aktiv: true }).run();
  const a = newId();
  db.insert(artikel).values({ id: a, name: "NaCl", einheit: "Fl.", fach: "B2", mindestbestand: 0, createdAt: new Date() }).run();
  return { fz, a };
}

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
  it("speichert ein Fahrzeug-Ziel", async () => {
    const db = createTestDb();
    const { fz } = seedZiele(db);
    const { id } = await createToken({ label: "RTW 1", zielTyp: "fahrzeug", zielId: fz }, db);
    const row = db.select().from(tokens).where(eq(tokens.id, id)).get()!;
    expect(row.zielTyp).toBe("fahrzeug");
    expect(row.zielId).toBe(fz);
  });
  it("speichert ein Artikel-Ziel", async () => {
    const db = createTestDb();
    const { a } = seedZiele(db);
    const { id } = await createToken({ label: "NaCl-Fach", zielTyp: "artikel", zielId: a }, db);
    const row = db.select().from(tokens).where(eq(tokens.id, id)).get()!;
    expect(row.zielTyp).toBe("artikel");
    expect(row.zielId).toBe(a);
  });
  it("lehnt ein Fahrzeug-Ziel ab, das kein Fahrzeug ist / nicht existiert", async () => {
    const db = createTestDb();
    seedZiele(db);
    await expect(createToken({ label: "x", zielTyp: "fahrzeug", zielId: "nope" }, db)).rejects.toThrow();
  });
  it("lehnt zielTyp ohne zielId ab", async () => {
    await expect(createToken({ label: "x", zielTyp: "artikel" }, createTestDb())).rejects.toThrow();
  });
  it("tokenListe löst den Zielnamen auf", async () => {
    const db = createTestDb();
    const { fz } = seedZiele(db);
    await createToken({ label: "RTW 1", zielTyp: "fahrzeug", zielId: fz }, db);
    const [row] = tokenListe(db);
    expect(row.zielTyp).toBe("fahrzeug");
    expect(row.zielName).toBe("RTW 1");
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
