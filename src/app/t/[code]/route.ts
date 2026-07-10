import { NextResponse } from "next/server";
import { consumeRate, clientIp } from "@/lib/auth/rateLimit";
import { redeemToken } from "@/actions/token-redeem";
import { HELFER_COOKIE, helferCookieOptions } from "@/lib/auth/helferSession";
import { sanitizeReturnTo } from "@/lib/auth/returnTo";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const url = new URL(req.url);
  const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo")) ?? "/helfer";
  const ip = clientIp(req.headers, "unknown");

  const gate = (msg?: string) => {
    const g = new URL("/", config.appBaseUrl);
    if (returnTo) g.searchParams.set("returnTo", returnTo);
    if (msg) g.searchParams.set("err", msg);
    return NextResponse.redirect(g);
  };

  if (!consumeRate(ip).ok) return gate("rate");
  const res = await redeemToken(code);
  if (!res.ok) return gate("code");

  const response = NextResponse.redirect(new URL(returnTo, config.appBaseUrl));
  response.cookies.set(HELFER_COOKIE, res.cookieValue, helferCookieOptions());
  return response;
}
