import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { getHelferPayload } from "@/actions/session";
import { getDb } from "@/db";
import { bzGeraetByBarcode } from "@/db/bz";
import { geraetByBarcode } from "@/db/geraete";

export const dynamic = "force-dynamic";

/**
 * Deep-Link vom gescannten Geräte-Barcode auf die passende Detailseite.
 * Der Barcode-Namensraum ist über generische Geräte (geraete) UND BZ-Geräte (bz_geraete) global
 * eindeutig (siehe geraetSpeichern), daher genügt „erst Geräte, dann BZ".
 * V1 ist admin-zentriert: Admins landen direkt auf dem Gerät; eine Helfer-Read-View ist bewusst
 * deferred (Rollen-Weiche analog /a/[artikelId]).
 */
export default async function GeraetDeepLink({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const session = await auth();

  if (!session?.user?.isAdmin) {
    // Kein Admin: Helfer-Read-View ist in V1 noch nicht vorhanden → zum Gate mit returnTo.
    const helfer = await getHelferPayload();
    if (helfer) redirect("/helfer"); // Helfer-Geräte-View deferred
    redirect(`/?returnTo=${encodeURIComponent(`/g/${code}`)}`);
  }

  const db = getDb();
  const ger = geraetByBarcode(db, code);
  if (ger) redirect(`/verwaltung/geraete/${ger.id}`);
  const bz = bzGeraetByBarcode(db, code);
  if (bz) redirect(`/verwaltung/bz/${bz.id}`);
  notFound();
}
