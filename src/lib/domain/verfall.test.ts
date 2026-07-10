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
  it("pins local-time month-end semantics near a day boundary", () => {
    // Local time (no Z): 30 minutes before 2026-07-31 23:59:59.999 local,
    // which is when "2026-07" expires. Locks in that verfallStatus compares
    // in local time, not UTC (TZ is pinned to Europe/Berlin for the suite).
    const nearBoundary = new Date("2026-07-31T23:30:00");
    const s = verfallStatus("2026-07", opts, nearBoundary);
    expect(s.abgelaufen).toBe(false);
    expect(s.tage).toBe(1);
    expect(s.ampel).toBe("rot");
  });
});
