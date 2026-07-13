import { describe, expect, it } from "vitest";
import {
  BZ_KONTROLL_INTERVALL_TAGE,
  bzFaelligkeit,
  imBereich,
  bewerteKontrolle,
  akkuLebensdauer,
} from "./bz";

const now = new Date("2026-07-13T12:00:00");
const vorTagen = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe("bzFaelligkeit", () => {
  it("noch nie geprüft → rot / nieGeprueft", () => {
    const f = bzFaelligkeit(null, now);
    expect(f.nieGeprueft).toBe(true);
    expect(f.ampel).toBe("rot");
    expect(f.faelligAm).toBeNull();
    expect(f.tageBisFaellig).toBeNull();
    expect(f.ueberfaellig).toBe(false);
  });
  it("Kontrolle vor 10 Tagen → gruen (faelligAm = +31d)", () => {
    const f = bzFaelligkeit(vorTagen(10), now);
    expect(f.ampel).toBe("gruen");
    expect(f.ueberfaellig).toBe(false);
    expect(f.tageBisFaellig).toBe(BZ_KONTROLL_INTERVALL_TAGE - 10);
  });
  it("Kontrolle vor 28 Tagen → gelb (innerhalb Warnfenster)", () => {
    const f = bzFaelligkeit(vorTagen(28), now);
    expect(f.ampel).toBe("gelb");
    expect(f.ueberfaellig).toBe(false);
  });
  it("Kontrolle vor 40 Tagen → rot / ueberfaellig", () => {
    const f = bzFaelligkeit(vorTagen(40), now);
    expect(f.ampel).toBe("rot");
    expect(f.ueberfaellig).toBe(true);
  });
  it("Grenzfall exakt 31 Tage → gerade fällig, nicht überfällig (gelb)", () => {
    const f = bzFaelligkeit(vorTagen(31), now);
    expect(f.ueberfaellig).toBe(false);
    expect(f.tageBisFaellig).toBe(0);
    expect(f.ampel).toBe("gelb");
  });
});

describe("imBereich", () => {
  it("Wert innerhalb → true", () => expect(imBereich(140, 127, 157)).toBe(true));
  it("Wert außerhalb → false", () => expect(imBereich(200, 127, 157)).toBe(false));
  it("Grenzwerte inklusiv", () => {
    expect(imBereich(127, 127, 157)).toBe(true);
    expect(imBereich(157, 127, 157)).toBe(true);
  });
  it("null-Argumente → null", () => {
    expect(imBereich(null, 127, 157)).toBeNull();
    expect(imBereich(140, null, 157)).toBeNull();
    expect(imBereich(140, 127, null)).toBeNull();
  });
});

describe("bewerteKontrolle", () => {
  const geraet = { level1Min: 127, level1Max: 157, level2Min: 309, level2Max: 387 };
  it("beide konfigurierten Level im Bereich → bestanden", () => {
    const r = bewerteKontrolle({ level1Wert: 140, level2Wert: 350, ...geraet });
    expect(r.level1ImBereich).toBe(true);
    expect(r.level2ImBereich).toBe(true);
    expect(r.bestanden).toBe(true);
  });
  it("eines außerhalb → nicht bestanden", () => {
    const r = bewerteKontrolle({ level1Wert: 140, level2Wert: 999, ...geraet });
    expect(r.bestanden).toBe(false);
  });
  it("konfiguriertes Level nicht gemessen → nicht bestanden", () => {
    const r = bewerteKontrolle({ level1Wert: 140, level2Wert: null, ...geraet });
    expect(r.bestanden).toBe(false);
  });
  it("komplett leere Kontrolle → nicht bestanden", () => {
    const r = bewerteKontrolle({ level1Wert: null, level2Wert: null, ...geraet });
    expect(r.bestanden).toBe(false);
  });
  it("kein Level konfiguriert, aber ein Wert erfasst → bestanden", () => {
    const r = bewerteKontrolle({
      level1Wert: 140, level2Wert: null,
      level1Min: null, level1Max: null, level2Min: null, level2Max: null,
    });
    expect(r.bestanden).toBe(true);
    expect(r.level1ImBereich).toBeNull();
  });
});

describe("akkuLebensdauer", () => {
  it("0 Wechsel → tageDurchschnitt null", () => {
    expect(akkuLebensdauer([]).tageDurchschnitt).toBeNull();
  });
  it("1 Wechsel → tageDurchschnitt null (kein Intervall)", () => {
    const r = akkuLebensdauer([new Date("2026-01-01")]);
    expect(r.tageDurchschnitt).toBeNull();
    expect(r.anzahlWechsel).toBe(1);
    expect(r.anzahlIntervalle).toBe(0);
  });
  it("3 Wechsel im 30-Tage-Raster → ~30 Tage, 2 Intervalle", () => {
    const r = akkuLebensdauer([
      new Date("2026-03-02"),
      new Date("2026-01-01"),
      new Date("2026-01-31"),
    ]);
    expect(r.anzahlWechsel).toBe(3);
    expect(r.anzahlIntervalle).toBe(2);
    expect(r.tageDurchschnitt).toBeCloseTo(30, 0);
  });
});
