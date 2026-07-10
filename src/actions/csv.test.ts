import { describe, expect, it, vi } from "vitest";

vi.mock("@/actions/session", () => ({ requireAdmin: async () => ({ userId: "admin" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createTestDb } from "@/db/testing";
import { ensureHandlager } from "@/db/seed-handlager";
import { artikel, buchungen } from "@/db/schema";
import { bestand } from "@/lib/domain/bestand";
import { parseArtikelCsv } from "@/lib/csv";
import { importArtikelCsv } from "./csv";

describe("csv", () => {
  it("parses valid rows and collects errors", () => {
    const csv = "name,einheit,fach,mindestbestand,startbestand\nMullbinde,Stk.,A2,20,24\nkaputt\n";
    const r = parseArtikelCsv(csv);
    expect(r.rows).toHaveLength(1);
    expect(r.errors.length).toBe(1);
  });

  it("imports articles with a Korrektur startbestand booking", async () => {
    const db = createTestDb();
    ensureHandlager(db);
    const csv = "name,einheit,fach,mindestbestand,startbestand\nKompressen,Pkg.,A3,30,40\n";
    const res = await importArtikelCsv(csv, db);
    expect(res.angelegt).toBe(1);
    const a = db.select().from(artikel).all()[0];
    const bu = db.select().from(buchungen).all();
    expect(bu[0].typ).toBe("korrektur");
    expect(bestand(bu.map((b) => ({ menge: b.menge })))).toBe(40);
    expect(a.name).toBe("Kompressen");
  });
});
