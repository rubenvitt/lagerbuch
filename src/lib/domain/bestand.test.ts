import { describe, expect, it } from "vitest";
import { bestand, bestandProCharge, bestandProLagerort, bestandProLagerortUndCharge } from "./bestand";

describe("bestand", () => {
  it("sums signed menge (zugang + / entnahme −)", () => {
    expect(bestand([{ menge: 10 }, { menge: -3 }, { menge: 2 }])).toBe(9);
  });
  it("is 0 for no rows", () => {
    expect(bestand([])).toBe(0);
  });
  it("aggregates per charge", () => {
    const m = bestandProCharge([
      { chargeId: "a", menge: 5 },
      { chargeId: "a", menge: -2 },
      { chargeId: "b", menge: 4 },
    ]);
    expect(m.get("a")).toBe(3);
    expect(m.get("b")).toBe(4);
  });
});

describe("bestandProLagerort", () => {
  const rows = [
    { lagerortId: "handlager", menge: 10 },
    { lagerortId: "handlager", menge: -3 },
    { lagerortId: "rtw1", menge: 5 },
    { lagerortId: "rtw1", menge: -1 },
  ];
  it("sums only the rows of the given lagerort", () => {
    expect(bestandProLagerort(rows, "handlager")).toBe(7);
    expect(bestandProLagerort(rows, "rtw1")).toBe(4);
  });
  it("is 0 for a lagerort without rows", () => {
    expect(bestandProLagerort(rows, "unbekannt")).toBe(0);
    expect(bestandProLagerort([], "handlager")).toBe(0);
  });
});

describe("bestandProLagerortUndCharge", () => {
  // dieselbe chargeId liegt in zwei Lagerorten — darf NICHT vermischt werden
  const rows = [
    { lagerortId: "handlager", chargeId: "c1", menge: 8 },
    { lagerortId: "handlager", chargeId: "c1", menge: -2 },
    { lagerortId: "handlager", chargeId: "c2", menge: 4 },
    { lagerortId: "rtw1", chargeId: "c1", menge: 3 },
  ];
  it("gives per-charge rest scoped to one lagerort only", () => {
    const h = bestandProLagerortUndCharge(rows, "handlager");
    expect(h.get("c1")).toBe(6);
    expect(h.get("c2")).toBe(4);
    expect(h.has("__none__")).toBe(false);
  });
  it("does not leak another lagerort's rows for the same charge", () => {
    const r = bestandProLagerortUndCharge(rows, "rtw1");
    expect(r.get("c1")).toBe(3);
    expect(r.get("c2")).toBeUndefined();
  });
  it("is an empty map for a lagerort without rows", () => {
    expect(bestandProLagerortUndCharge(rows, "leer").size).toBe(0);
  });
});
