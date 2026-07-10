import { describe, expect, it } from "vitest";
import { bestand, bestandProCharge } from "./bestand";

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
