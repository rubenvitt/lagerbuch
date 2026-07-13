import { describe, expect, it } from "vitest";
import { fuellstandProzent, o2Status } from "./o2";

describe("fuellstandProzent", () => {
  it("berechnet Prozent vom Nennfülldruck (gerundet)", () => {
    expect(fuellstandProzent(100, 200)).toBe(50);
    expect(fuellstandProzent(200, 200)).toBe(100);
    expect(fuellstandProzent(50, 200)).toBe(25);
  });
  it("nenndruck <= 0 → 0", () => {
    expect(fuellstandProzent(100, 0)).toBe(0);
    expect(fuellstandProzent(100, -5)).toBe(0);
  });
  it("klemmt nicht auf 100 (Überfüllung sichtbar)", () => {
    expect(fuellstandProzent(220, 200)).toBe(110);
  });
});

describe("o2Status Ampel", () => {
  it("80 % → gruen, nicht niedrig", () => {
    const s = o2Status(160, 200);
    expect(s.prozent).toBe(80);
    expect(s.ampel).toBe("gruen");
    expect(s.niedrig).toBe(false);
  });
  it("49 % → gelb (nicht niedrig)", () => {
    const s = o2Status(98, 200);
    expect(s.prozent).toBe(49);
    expect(s.ampel).toBe("gelb");
    expect(s.niedrig).toBe(false);
  });
  it("24 % → rot/niedrig (Warnung)", () => {
    const s = o2Status(48, 200);
    expect(s.prozent).toBe(24);
    expect(s.ampel).toBe("rot");
    expect(s.niedrig).toBe(true);
  });
  it("Schwellen exakt: 50 % → gruen, 25 % → gelb", () => {
    expect(o2Status(100, 200).ampel).toBe("gruen"); // exakt 50 % ist nicht < 50
    expect(o2Status(50, 200).ampel).toBe("gelb"); // exakt 25 % ist nicht < 25
  });
});
