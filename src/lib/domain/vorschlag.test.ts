import { describe, expect, it } from "vitest";
import { braucht, vorschlagsmenge } from "./vorschlag";

describe("bestellvorschlag", () => {
  it("needs an order below mindestbestand", () => {
    expect(braucht(3, 10)).toBe(true);
    expect(braucht(10, 10)).toBe(false);
    expect(braucht(12, 10)).toBe(false);
  });
  it("suggests faktor*min - bestand", () => {
    expect(vorschlagsmenge(3, 10, 2)).toBe(17); // 2*10 - 3
  });
  it("suggests 0 when not needed", () => {
    expect(vorschlagsmenge(10, 10, 2)).toBe(0);
    expect(vorschlagsmenge(25, 10, 2)).toBe(0);
  });
});
