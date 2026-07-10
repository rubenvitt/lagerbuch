import { describe, expect, it } from "vitest";
import { parseConfig } from "./config";

describe("parseConfig", () => {
  it("applies defaults for an empty environment", () => {
    const c = parseConfig({} as NodeJS.ProcessEnv);
    expect(c.appName).toBe("Lagerbuch");
    expect(c.appOrg).toBe("");
    expect(c.appTagline).toBe("Materialverwaltung");
    expect(c.appBaseUrl).toBe("http://localhost:3000");
    expect(c.databasePath).toBe("/data/lagerbuch.db");
    expect(c.tz).toBe("Europe/Berlin");
    expect(c.warnTageKritisch).toBe(31);
    expect(c.warnTageFaellig).toBe(56);
    expect(c.bestellFaktor).toBe(2);
    expect(c.helferSessionStunden).toBe(12);
  });

  it("reads overrides and coerces numbers", () => {
    const c = parseConfig({
      APP_ORG: "DRK Bereitschaft Musterstadt",
      WARN_TAGE_KRITISCH: "14",
      BESTELL_FAKTOR: "3",
    } as unknown as NodeJS.ProcessEnv);
    expect(c.appOrg).toBe("DRK Bereitschaft Musterstadt");
    expect(c.warnTageKritisch).toBe(14);
    expect(c.bestellFaktor).toBe(3);
  });

  it("throws on a non-numeric warn window", () => {
    expect(() =>
      parseConfig({ WARN_TAGE_KRITISCH: "bald" } as unknown as NodeJS.ProcessEnv),
    ).toThrow();
  });

  it("throws on an invalid base URL", () => {
    expect(() =>
      parseConfig({ APP_BASE_URL: "not-a-url" } as unknown as NodeJS.ProcessEnv),
    ).toThrow();
  });
});
