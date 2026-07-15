import { describe, expect, it } from "vitest";
import { datumFaelligkeit, geraetFaelligkeit } from "./geraet";

// 2026-07-15 (Monat 0-indexiert: 6 = Juli)
const NOW = new Date(2026, 6, 15);

describe("datumFaelligkeit", () => {
  it("kein Datum → keinDatum, neutral (nicht überfällig)", () => {
    const f = datumFaelligkeit(null, NOW, 30);
    expect(f.keinDatum).toBe(true);
    expect(f.ueberfaellig).toBe(false);
    expect(f.tageBisFaellig).toBeNull();
  });

  it("ungültiges Datum (auch 2026-02-31) → keinDatum", () => {
    expect(datumFaelligkeit("2026-02-31", NOW, 30).keinDatum).toBe(true);
    expect(datumFaelligkeit("kaputt", NOW, 30).keinDatum).toBe(true);
  });

  it("weit in der Zukunft → grün", () => {
    const f = datumFaelligkeit("2026-12-31", NOW, 30);
    expect(f.ampel).toBe("gruen");
    expect(f.ueberfaellig).toBe(false);
    expect(f.tageBisFaellig).toBeGreaterThan(30);
  });

  it("im Warnfenster → gelb", () => {
    const f = datumFaelligkeit("2026-08-01", NOW, 30); // 17 Tage
    expect(f.ampel).toBe("gelb");
    expect(f.tageBisFaellig).toBe(17);
  });

  it("heute fällig → gelb, 0 Tage, nicht überfällig", () => {
    const f = datumFaelligkeit("2026-07-15", NOW, 30);
    expect(f.tageBisFaellig).toBe(0);
    expect(f.ampel).toBe("gelb");
    expect(f.ueberfaellig).toBe(false);
  });

  it("in der Vergangenheit → rot, negative Tage, überfällig", () => {
    const f = datumFaelligkeit("2026-07-10", NOW, 30);
    expect(f.ueberfaellig).toBe(true);
    expect(f.ampel).toBe("rot");
    expect(f.tageBisFaellig).toBe(-5);
  });
});

describe("geraetFaelligkeit wählt das typ-relevante Feld", () => {
  it("medizin nutzt mtkFaellig", () => {
    const f = geraetFaelligkeit({ typ: "medizin", mtkFaellig: "2026-07-10", ablaufdatum: null }, NOW);
    expect(f.ueberfaellig).toBe(true);
  });

  it("objekt nutzt ablaufdatum, ignoriert mtkFaellig", () => {
    const f = geraetFaelligkeit({ typ: "objekt", mtkFaellig: "2026-07-10", ablaufdatum: null }, NOW);
    expect(f.keinDatum).toBe(true); // Ablaufdatum null → neutral
  });
});
