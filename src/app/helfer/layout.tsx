import { redirect } from "next/navigation";
import { getHelferPayload } from "@/actions/session";
import { HelferFrame } from "@/components/HelferFrame";

export const dynamic = "force-dynamic";

export default async function HelferLayout({ children }: { children: React.ReactNode }) {
  const payload = await getHelferPayload();
  if (!payload) redirect("/?returnTo=%2Fhelfer"); // Doppelabsicherung neben der Middleware
  return <HelferFrame tokenLabel={`Zugang: Token ${payload.code} · ${payload.label}`}>{children}</HelferFrame>;
}
