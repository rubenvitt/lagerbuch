import { SignJWT, jwtVerify } from "jose";
import { config } from "@/lib/config";

export const HELFER_COOKIE = "helfer_session";

export type HelferPayload = { tokenId: string; code: string; label: string };

const secret = () => new TextEncoder().encode(config.helferSessionSecret);

export async function createHelferSession(p: HelferPayload): Promise<string> {
  return new SignJWT({ tokenId: p.tokenId, code: p.code, label: p.label })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${config.helferSessionStunden}h`)
    .sign(secret());
}

export async function verifyHelferSession(value: string): Promise<HelferPayload | null> {
  try {
    const { payload } = await jwtVerify(value, secret(), { algorithms: ["HS256"] });
    const { tokenId, code, label } = payload as Record<string, unknown>;
    if (typeof tokenId === "string" && typeof code === "string" && typeof label === "string") {
      return { tokenId, code, label };
    }
    return null;
  } catch {
    return null;
  }
}

export function helferCookieOptions() {
  const secure = config.nodeEnv === "production" || config.appBaseUrl.startsWith("https://");
  return { httpOnly: true as const, sameSite: "lax" as const, path: "/" as const, maxAge: config.helferSessionStunden * 3600, secure };
}
