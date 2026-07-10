import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/config", () => ({
  config: { helferSessionSecret: "test-secret-xxxxxxxxxxxxxxxxxxxxxxxx", helferSessionStunden: 12, nodeEnv: "development", appBaseUrl: "http://localhost:3000" },
}));
import { createHelferSession, verifyHelferSession, helferCookieOptions } from "./helferSession";

describe("helferSession", () => {
  it("round-trips payload", async () => {
    const token = await createHelferSession({ tokenId: "t1", code: "831-042", label: "RTW 1" });
    const p = await verifyHelferSession(token);
    expect(p).toMatchObject({ tokenId: "t1", code: "831-042", label: "RTW 1" });
  });
  it("gibt null für manipuliertes Token", async () => {
    const token = await createHelferSession({ tokenId: "t1", code: "c", label: "l" });
    expect(await verifyHelferSession(token + "x")).toBeNull();
    expect(await verifyHelferSession("garbage")).toBeNull();
  });
  it("Secure=false im Dev (http)", () => {
    expect(helferCookieOptions().secure).toBe(false);
    expect(helferCookieOptions().httpOnly).toBe(true);
    expect(helferCookieOptions().sameSite).toBe("lax");
  });
});
