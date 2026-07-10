import { describe, expect, it } from "vitest";
import { sanitizeReturnTo } from "./returnTo";

describe("sanitizeReturnTo", () => {
  it("lässt lokale Pfade durch", () => {
    expect(sanitizeReturnTo("/helfer")).toBe("/helfer");
    expect(sanitizeReturnTo("/a/abc123")).toBe("/a/abc123");
  });
  it("verwirft protokoll-relative und absolute URLs", () => {
    expect(sanitizeReturnTo("//evil.example")).toBeNull();
    expect(sanitizeReturnTo("https://evil.example")).toBeNull();
    expect(sanitizeReturnTo("javascript:alert(1)")).toBeNull();
  });
  it("verwirft Backslash-Präfixe (Browser normalisieren '/\\' zu '//')", () => {
    expect(sanitizeReturnTo("/\\evil.example")).toBeNull();
    expect(sanitizeReturnTo("/\\/evil.example")).toBeNull();
  });
  it("verwirft nicht mit / beginnende und leere Werte", () => {
    expect(sanitizeReturnTo("helfer")).toBeNull();
    expect(sanitizeReturnTo(null)).toBeNull();
    expect(sanitizeReturnTo("")).toBeNull();
  });
});
