import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getHelferPayload } from "@/actions/session";
import { getDb } from "@/db";
import { artikelDetailHelfer } from "@/db/queries";
import { HelferDetail } from "@/components/HelferDetail";

export const dynamic = "force-dynamic";

export default async function ArtikelDeepLink({ params }: { params: Promise<{ artikelId: string }> }) {
  const { artikelId } = await params;
  const helfer = await getHelferPayload();

  if (!helfer) {
    // Kein Helfer: Admins zur Verwaltung, alle anderen zum Gate (Middleware fängt
    // den reinen Kein-Session-Fall bereits ab; dies ist die Rollen-Weiche).
    const session = await auth();
    if (session?.user?.isAdmin) redirect(`/verwaltung/artikel?a=${artikelId}`);
    redirect(`/?returnTo=${encodeURIComponent(`/a/${artikelId}`)}`);
  }

  const detail = artikelDetailHelfer(getDb(), artikelId);
  if (!detail) redirect("/helfer");
  return <HelferDetail detail={detail} tokenLabel={`Zugang: Token ${helfer.code} · ${helfer.label}`} />;
}
