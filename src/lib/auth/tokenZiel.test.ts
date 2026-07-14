import { describe, expect, it } from "vitest";
import { tokenZielPfad } from "./tokenZiel";

describe("tokenZielPfad", () => {
  it("führt Artikel-Ziele auf das Material-Detail", () => {
    expect(tokenZielPfad("artikel", "a1")).toBe("/a/a1");
  });
  it("führt Fahrzeug-Ziele direkt in den Fahrzeug-Check", () => {
    expect(tokenZielPfad("fahrzeug", "fz1")).toBe("/helfer/check?fz=fz1");
  });
  it("fällt ohne Ziel auf die Artikel-Liste zurück", () => {
    expect(tokenZielPfad(null, null)).toBe("/helfer");
    expect(tokenZielPfad(undefined, undefined)).toBe("/helfer");
    // defensiv: Typ ohne ID → kein kaputter Pfad, sondern Fallback
    expect(tokenZielPfad("fahrzeug", null)).toBe("/helfer");
  });
});
