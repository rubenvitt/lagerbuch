import { describe, expect, it } from "vitest";
import { verfallStatus } from "./verfall";

const opts = { kritisch: 31, faellig: 56 };
const now = new Date("2026-07-10T12:00:00Z");

describe("verfallStatus", () => {
  it("green when far in the future", () => {
    expect(verfallStatus("2027-01", opts, now).ampel).toBe("gruen");
  });
  it("yellow inside the faellig window (≤56d, >31d)", () => {
    // 2026-08 expires 2026-08-31 → ~52 days out
    const s = verfallStatus("2026-08", opts, now);
    expect(s.ampel).toBe("gelb");
  });
  it("red inside the kritisch window (≤31d)", () => {
    // 2026-07 expires 2026-07-31 → ~21 days out
    expect(verfallStatus("2026-07", opts, now).ampel).toBe("rot");
  });
  it("red and abgelaufen when the month already ended", () => {
    const s = verfallStatus("2026-06", opts, now); // expired 2026-06-30
    expect(s.ampel).toBe("rot");
    expect(s.abgelaufen).toBe(true);
    expect(s.tage).toBeLessThan(0);
  });
  it("handles a leap-year February end", () => {
    // 2028-02 expires 2028-02-29
    const s = verfallStatus("2028-02", opts, new Date("2028-02-01T00:00:00Z"));
    expect(s.tage).toBeGreaterThanOrEqual(28);
  });
});
