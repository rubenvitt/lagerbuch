import { auth } from "@/auth";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb, type DB } from "@/db";
import { tokens } from "@/db/schema";
import { HELFER_COOKIE, verifyHelferSession, type HelferPayload } from "@/lib/auth/helferSession";

export async function requireAdmin(): Promise<{ userId: string }> {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error("Kein Zugriff");
  return { userId: session.user.id };
}

export async function getHelferPayload(): Promise<HelferPayload | null> {
  const value = (await cookies()).get(HELFER_COOKIE)?.value;
  if (!value) return null;
  return verifyHelferSession(value);
}

// Autoritative Sperrprüfung: verifiziertes Cookie + DB-Recheck tokens.aktiv.
// Bei JEDER schreibenden Helfer-Aktion aufrufen (sofortige Sperrwirkung, Spec §3.1).
export async function requireHelfer(db: DB = getDb()): Promise<{ tokenId: string; code: string }> {
  const payload = await getHelferPayload();
  if (!payload) throw new Error("Keine gültige Helfer-Session");
  const t = db.select().from(tokens).where(eq(tokens.id, payload.tokenId)).get();
  if (!t || !t.aktiv) throw new Error("Token gesperrt");
  return { tokenId: t.id, code: t.code };
}
