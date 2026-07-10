import { describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";
vi.mock("@/lib/config", () => ({
  config: { helferSessionSecret: "test-secret-xxxxxxxxxxxxxxxxxxxxxxxx", helferSessionStunden: 12, nodeEnv: "development", appBaseUrl: "http://localhost:3000" },
}));
import { createHelferSession, verifyHelferSession, helferCookieOptions } from "./helferSession";

const SECRET = new TextEncoder().encode("test-secret-xxxxxxxxxxxxxxxxxxxxxxxx");

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
  it("gibt null für abgelaufenes Token", async () => {
    // Korrekt signiert (gültige Signatur), aber exp in der Vergangenheit ->
    // jwtVerify wirft JWTExpired -> verifyHelferSession liefert null.
    const abgelaufen = await new SignJWT({ tokenId: "t1", code: "831-042", label: "RTW 1" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(SECRET);
    expect(await verifyHelferSession(abgelaufen)).toBeNull();
  });
  it("Secure=false im Dev (http)", () => {
    expect(helferCookieOptions().secure).toBe(false);
    expect(helferCookieOptions().httpOnly).toBe(true);
    expect(helferCookieOptions().sameSite).toBe("lax");
  });
});
