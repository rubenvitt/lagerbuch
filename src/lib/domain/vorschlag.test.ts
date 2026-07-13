import { describe, expect, it } from "vitest";
import { braucht, vorschlagsmenge } from "./vorschlag";

describe("bestellvorschlag", () => {
  it("needs an order below mindestbestand", () => {
    expect(braucht(3, 10)).toBe(true);
    expect(braucht(10, 10)).toBe(false);
    expect(braucht(12, 10)).toBe(false);
  });
  it("suggests exactly the gap up to mindestbestand", () => {
    expect(vorschlagsmenge(3, 10)).toBe(7); // 10 - 3, nur auffüllen
    expect(vorschlagsmenge(0, 10)).toBe(10);
  });
  it("suggests 0 when at or above mindestbestand", () => {
    expect(vorschlagsmenge(10, 10)).toBe(0);
    expect(vorschlagsmenge(25, 10)).toBe(0);
  });
});
