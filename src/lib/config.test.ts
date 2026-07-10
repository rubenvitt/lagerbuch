import { describe, expect, it } from "vitest";
import { assertProductionSecrets, parseConfig } from "./config";

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

  it("defaults auth fields and dev-login off", () => {
    const c = parseConfig({} as NodeJS.ProcessEnv);
    expect(c.oidcAdminGroup).toBe("lagerbuch-admin");
    expect(c.authDevLogin).toBe(false);
  });

  it("throws when AUTH_DEV_LOGIN=true in production", () => {
    expect(() =>
      parseConfig({
        NODE_ENV: "production",
        AUTH_DEV_LOGIN: "true",
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow();
  });

  it("allows AUTH_DEV_LOGIN=true outside production", () => {
    const c = parseConfig({
      NODE_ENV: "development",
      AUTH_DEV_LOGIN: "true",
    } as unknown as NodeJS.ProcessEnv);
    expect(c.authDevLogin).toBe(true);
  });

  it("liest HELFER_SESSION_SECRET (Default = Dev-Secret)", () => {
    const c = parseConfig({} as NodeJS.ProcessEnv);
    expect(c.helferSessionSecret).toBe("dev-insecure-secret-change-me");
  });
});

describe("assertProductionSecrets", () => {
  it("throws in production with the dev-default AUTH_SECRET", () => {
    const c = { ...parseConfig({} as NodeJS.ProcessEnv), nodeEnv: "production" };
    expect(() => assertProductionSecrets(c)).toThrow();
  });

  it("throws in production with an empty AUTH_SECRET", () => {
    const c = {
      ...parseConfig({} as NodeJS.ProcessEnv),
      nodeEnv: "production",
      authSecret: "",
    };
    expect(() => assertProductionSecrets(c)).toThrow();
  });

  it("does not throw in production with a real AUTH_SECRET", () => {
    const c = {
      ...parseConfig({} as NodeJS.ProcessEnv),
      nodeEnv: "production",
      authSecret: "a-real-secret",
      helferSessionSecret: "a-real-helfer-secret",
    };
    expect(() => assertProductionSecrets(c)).not.toThrow();
  });

  it("does not throw outside production with the dev-default AUTH_SECRET", () => {
    const c = { ...parseConfig({} as NodeJS.ProcessEnv), nodeEnv: "development" };
    expect(() => assertProductionSecrets(c)).not.toThrow();
  });

  it("assertProductionSecrets wirft ohne HELFER_SESSION_SECRET in prod", () => {
    const c = parseConfig({
      NODE_ENV: "production",
      AUTH_SECRET: "x".repeat(40),
    } as NodeJS.ProcessEnv);
    expect(() => assertProductionSecrets(c)).toThrow(/HELFER_SESSION_SECRET/);
  });
});
