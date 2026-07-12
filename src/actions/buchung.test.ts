import { describe, expect, it, vi } from "vitest";
vi.mock("@/actions/session", () => ({
  requireAdmin: async () => ({ userId: "admin1" }),
  requireHelfer: async () => ({ tokenId: "tok1", code: "831-042" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
import { createTestDb } from "@/db/testing";
import { artikel, chargen, buchungen, lagerorte, newId } from "@/db/schema";
import { eq } from "drizzle-orm";
import { bestand } from "@/lib/domain/bestand";
import { ensureHandlager } from "@/db/seed-handlager";
import { bucheZugang, bucheEntnahme } from "./buchung";
import { bucheEntnahmeHelfer } from "./buchung";
import { fefoAbbuchung } from "@/db/abbuchung";

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
  it("books +menge onto an existing charge of the same article", async () => {
    const { db, id } = seedArtikel();
    await bucheZugang({ artikelId: id, menge: 3, neueCharge: { chargenNr: "N1", verfall: "2028-06" } }, db);
    const charge = db.select().from(chargen).where(eq(chargen.artikelId, id)).get()!;
    await bucheZugang({ artikelId: id, menge: 4, chargeId: charge.id }, db);
    expect(db.select().from(chargen).where(eq(chargen.artikelId, id)).all()).toHaveLength(1);
    const bu = db.select().from(buchungen).where(eq(buchungen.artikelId, id)).all();
    expect(bestand(bu.map((b) => ({ menge: b.menge })))).toBe(7);
  });
  it("rejects a chargeId that belongs to a different article", async () => {
    const { db, id } = seedArtikel();
    const otherId = newId();
    db.insert(artikel).values({ id: otherId, name: "Andere", einheit: "Stk", fach: "A1", mindestbestand: 1, bestelltAt: null, createdAt: new Date() }).run();
    const foreignChargeId = newId();
    db.insert(chargen).values({ id: foreignChargeId, artikelId: otherId, chargenNr: "F1", verfall: "2027-01", createdAt: new Date() }).run();
    await expect(bucheZugang({ artikelId: id, menge: 5, chargeId: foreignChargeId }, db)).rejects.toThrow();
    // no phantom booking should have landed on either article
    const bu = db.select().from(buchungen).where(eq(buchungen.artikelId, id)).all();
    expect(bu).toHaveLength(0);
  });
  it("rejects when both chargeId and neueCharge are given", async () => {
    const { db, id } = seedArtikel();
    await expect(
      bucheZugang({ artikelId: id, menge: 1, chargeId: newId(), neueCharge: { chargenNr: "X", verfall: "2028-01" } }, db),
    ).rejects.toThrow();
  });
  it("rejects when neither chargeId nor neueCharge is given", async () => {
    const { db, id } = seedArtikel();
    await expect(bucheZugang({ artikelId: id, menge: 1 }, db)).rejects.toThrow();
  });
  it("rejects menge: 0", async () => {
    const { db, id } = seedArtikel();
    await expect(
      bucheZugang({ artikelId: id, menge: 0, neueCharge: { chargenNr: "Z", verfall: "2028-01" } }, db),
    ).rejects.toThrow();
  });
});

describe("bucheEntnahme", () => {
  it("entnahme distributes FEFO and caps at Bestand", async () => {
    const { db, id } = seedArtikel();
    await bucheZugang({ artikelId: id, menge: 3, neueCharge: { chargenNr: "E", verfall: "2026-08" } }, db);
    await bucheZugang({ artikelId: id, menge: 10, neueCharge: { chargenNr: "L", verfall: "2028-01" } }, db);
    const { gebucht } = await bucheEntnahme({ artikelId: id, menge: 5 }, db);
    expect(gebucht).toBe(5);
    // earliest charge fully drained (3), later charge -2 → bestand 8
    const bu = db.select().from(buchungen).where(eq(buchungen.artikelId, id)).all();
    expect(bestand(bu.map((b) => ({ menge: b.menge })))).toBe(8);
  });
  it("caps entnahme at available Bestand", async () => {
    const { db, id } = seedArtikel();
    await bucheZugang({ artikelId: id, menge: 3, neueCharge: { chargenNr: "E", verfall: "2026-08" } }, db);
    const { gebucht } = await bucheEntnahme({ artikelId: id, menge: 99 }, db);
    expect(gebucht).toBe(3);
  });
  it("rejects menge: 0", async () => {
    const { db, id } = seedArtikel();
    await expect(bucheEntnahme({ artikelId: id, menge: 0 }, db)).rejects.toThrow();
  });
  it("mit Ziel-Fahrzeug lagert Handlager→Fahrzeug um (statt Verbrauch)", async () => {
    const { db, id } = seedArtikel();
    await bucheZugang({ artikelId: id, menge: 10, neueCharge: { chargenNr: "Z", verfall: "2028-01" } }, db);
    const fz = newId();
    db.insert(lagerorte).values({ id: fz, name: "RTW 1", typ: "fahrzeug", aktiv: true }).run();
    const { gebucht } = await bucheEntnahme({ artikelId: id, menge: 4, zielLagerortId: fz }, db);
    expect(gebucht).toBe(4);
    const bu = db.select().from(buchungen).where(eq(buchungen.artikelId, id)).all();
    // Handlager 10 → 6, Fahrzeug 0 → 4, Gesamt unverändert (Umlagerung, kein Verbrauch)
    expect(bu.filter((b) => b.lagerortId === "handlager").reduce((s, b) => s + b.menge, 0)).toBe(6);
    expect(bu.filter((b) => b.lagerortId === fz).reduce((s, b) => s + b.menge, 0)).toBe(4);
    expect(bu.every((b) => b.typ !== "entnahme")).toBe(true); // Umlagerung, nicht Entnahme
  });
  it("weist ein Ziel ab, das kein Fahrzeug ist", async () => {
    const { db, id } = seedArtikel();
    await bucheZugang({ artikelId: id, menge: 5, neueCharge: { chargenNr: "Z", verfall: "2028-01" } }, db);
    await expect(bucheEntnahme({ artikelId: id, menge: 2, zielLagerortId: "handlager-x" }, db)).rejects.toThrow();
  });
  it("weist ein INAKTIVES Fahrzeug als Ziel ab", async () => {
    const { db, id } = seedArtikel();
    await bucheZugang({ artikelId: id, menge: 5, neueCharge: { chargenNr: "Z", verfall: "2028-01" } }, db);
    const fz = newId();
    db.insert(lagerorte).values({ id: fz, name: "Alt-RTW", typ: "fahrzeug", aktiv: false }).run();
    await expect(bucheEntnahme({ artikelId: id, menge: 2, zielLagerortId: fz }, db)).rejects.toThrow();
  });
});

describe("bucheEntnahmeHelfer", () => {
  it("bucht FEFO mit quelleTyp=token und quelleId=code", async () => {
    const { db, id } = seedArtikel();
    await bucheZugang({ artikelId: id, menge: 4, neueCharge: { chargenNr: "H", verfall: "2027-01" } }, db);
    const { gebucht } = await bucheEntnahmeHelfer({ artikelId: id, menge: 3 }, db);
    expect(gebucht).toBe(3);
    const entn = db.select().from(buchungen).where(eq(buchungen.typ, "entnahme")).all();
    expect(entn.length).toBeGreaterThan(0);
    expect(entn.every((b) => b.quelleTyp === "token" && b.quelleId === "831-042")).toBe(true);
  });
  it("kappt bei Übermenge", async () => {
    const { db, id } = seedArtikel();
    await bucheZugang({ artikelId: id, menge: 2, neueCharge: { chargenNr: "H", verfall: "2027-01" } }, db);
    expect((await bucheEntnahmeHelfer({ artikelId: id, menge: 99 }, db)).gebucht).toBe(2);
  });
});

it("normale Entnahme setzt referenz=null", async () => {
  const { db, id } = seedArtikel();
  await bucheZugang({ artikelId: id, menge: 4, neueCharge: { chargenNr: "H", verfall: "2028-01" } }, db);
  await bucheEntnahme({ artikelId: id, menge: 2 }, db);
  const entn = db.select().from(buchungen).where(eq(buchungen.typ, "entnahme")).all();
  expect(entn.length).toBeGreaterThan(0);
  expect(entn.every((b) => b.referenz === null)).toBe(true);
});

describe("fefoAbbuchung typ", () => {
  it("schreibt korrektur-Zeilen wenn typ=korrektur", async () => {
    const { db, id } = seedArtikel();
    await bucheZugang({ artikelId: id, menge: 5, neueCharge: { chargenNr: "K", verfall: "2028-01" } }, db);
    db.transaction((tx) => {
      const { gebucht } = fefoAbbuchung(tx, { artikelId: id, menge: 2, quelle: { quelleTyp: "oidc", quelleId: "u1" }, kommentar: "inv", referenz: "inventur:x", typ: "korrektur" });
      expect(gebucht).toBe(2);
    });
    const korr = db.select().from(buchungen).where(eq(buchungen.typ, "korrektur")).all();
    expect(korr).toHaveLength(1);
    expect(korr[0].menge).toBe(-2);
    expect(korr[0].referenz).toBe("inventur:x");
  });
});
