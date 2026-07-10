import { eq } from "drizzle-orm";
import { getDb, type DB } from "@/db";
import { tokens } from "@/db/schema";
import { createHelferSession, type HelferPayload } from "@/lib/auth/helferSession";

export async function redeemToken(
  code: string,
  db: DB = getDb(),
): Promise<{ ok: true; cookieValue: string; payload: HelferPayload } | { ok: false }> {
  const norm = code.trim().toUpperCase();
  const t = db.select().from(tokens).where(eq(tokens.code, norm)).get();
  if (!t || !t.aktiv) return { ok: false };
  db.update(tokens).set({ lastUsedAt: new Date() }).where(eq(tokens.id, t.id)).run();
  const payload: HelferPayload = { tokenId: t.id, code: t.code, label: t.label };
  const cookieValue = await createHelferSession(payload);
  return { ok: true, cookieValue, payload };
}
