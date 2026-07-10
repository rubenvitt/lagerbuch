import { describe, expect, it } from "vitest";
import { helferGateDecision } from "./cordon";

describe("helferGateDecision", () => {
  it("/helfer ohne Helfer → Gate mit returnTo", () => {
    expect(helferGateDecision({ pathname: "/helfer", search: "", hasHelfer: false, isAdmin: false }))
      .toEqual({ action: "redirect", to: "/?returnTo=%2Fhelfer" });
  });
  it("/helfer mit Helfer → allow", () => {
    expect(helferGateDecision({ pathname: "/helfer", search: "", hasHelfer: true, isAdmin: false }))
      .toEqual({ action: "allow" });
  });
  it("/helfer als reiner Admin → Gate (Admin ist kein Helfer)", () => {
    expect(helferGateDecision({ pathname: "/helfer", search: "", hasHelfer: false, isAdmin: true }).action)
      .toBe("redirect");
  });
  it("/a/{id} mit Helfer oder Admin → allow", () => {
    expect(helferGateDecision({ pathname: "/a/x1", search: "", hasHelfer: true, isAdmin: false }).action).toBe("allow");
    expect(helferGateDecision({ pathname: "/a/x1", search: "", hasHelfer: false, isAdmin: true }).action).toBe("allow");
  });
  it("/a/{id} ohne Session → Gate mit returnTo inkl. search", () => {
    expect(helferGateDecision({ pathname: "/a/x1", search: "?q=1", hasHelfer: false, isAdmin: false }))
      .toEqual({ action: "redirect", to: "/?returnTo=%2Fa%2Fx1%3Fq%3D1" });
  });
});
