import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/config", () => ({ config: { appBaseUrl: "https://lager.example" } }));
import { createTestDb } from "@/db/testing";
import { artikel, tokens, newId } from "@/db/schema";
import { etikettenDaten } from "./etiketten";

describe("etikettenDaten", () => {
  it("liefert aktive Artikel + Token mit absolutem Deep-Link + QR-Data-URI", async () => {
    const db = createTestDb();
    const a = newId();
    db.insert(artikel).values({ id: a, name: "NaCl", einheit: "Fl.", fach: "B2", mindestbestand: 0, createdAt: new Date() }).run();
    db.insert(tokens).values({ id: newId(), code: "831-042", label: "RTW 1", aktiv: true, createdAt: new Date(), createdBy: "admin1" }).run();
    db.insert(tokens).values({ id: newId(), code: "000-000", label: "gesperrt", aktiv: false, createdAt: new Date(), createdBy: "admin1" }).run();
    const d = await etikettenDaten(db);
    expect(d.artikel).toHaveLength(1);
    expect(d.artikel[0].url).toBe(`https://lager.example/a/${a}`);
    expect(d.artikel[0].qr.startsWith("data:image/png")).toBe(true);
    expect(d.tokens).toHaveLength(1); // gesperrter ausgeschlossen
    expect(d.tokens[0].url).toBe("https://lager.example/t/831-042");
    expect(d.tokens[0].qr.startsWith("data:image/png")).toBe(true);
  });
});
