import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import type { DB } from "@/db";
import { artikel, tokens } from "@/db/schema";
import { config } from "@/lib/config";

export type ArtikelEtikett = { id: string; name: string; fach: string; url: string; qr: string };
export type TokenEtikett = { code: string; label: string; url: string; qr: string };

function qr(text: string): Promise<string> {
  return QRCode.toDataURL(text, { margin: 1, width: 200 });
}

export async function etikettenDaten(db: DB): Promise<{ artikel: ArtikelEtikett[]; tokens: TokenEtikett[] }> {
  const base = config.appBaseUrl.replace(/\/$/, "");
  const arts = db.select().from(artikel).where(eq(artikel.aktiv, true)).all();
  const toks = db.select().from(tokens).where(eq(tokens.aktiv, true)).all();
  const artikelEtiketten = await Promise.all(arts.map(async (a) => {
    const url = `${base}/a/${a.id}`;
    return { id: a.id, name: a.name, fach: a.fach, url, qr: await qr(url) };
  }));
  const tokenEtiketten = await Promise.all(toks.map(async (t) => {
    const url = `${base}/t/${t.code}`;
    return { code: t.code, label: t.label, url, qr: await qr(url) };
  }));
  return { artikel: artikelEtiketten, tokens: tokenEtiketten };
}
