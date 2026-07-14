"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { consumeRate, clientIp } from "@/lib/auth/rateLimit";
import { redeemToken } from "@/actions/token-redeem";
import { HELFER_COOKIE, helferCookieOptions } from "@/lib/auth/helferSession";
import { sanitizeReturnTo } from "@/lib/auth/returnTo";
import { tokenZielPfad } from "@/lib/auth/tokenZiel";

export type GateState = { error?: string };

export async function einloesenAmGate(_prev: GateState, formData: FormData): Promise<GateState> {
  const code = String(formData.get("code") ?? "");
  // Ein ausdrücklich mitgegebenes returnTo (Deep-Link) hat Vorrang; sonst führt der Code an
  // sein hinterlegtes Ziel (Fahrzeug/Material) bzw. auf die Artikel-Liste.
  const returnTo = sanitizeReturnTo(String(formData.get("returnTo") ?? ""));
  const ip = clientIp(await headers(), "unknown");

  if (!consumeRate(ip).ok) return { error: "Zu viele Versuche. Bitte kurz warten." };
  const res = await redeemToken(code);
  if (!res.ok) return { error: "Code nicht gefunden oder gesperrt." };

  (await cookies()).set(HELFER_COOKIE, res.cookieValue, helferCookieOptions());
  redirect(returnTo ?? tokenZielPfad(res.zielTyp, res.zielId));
}
