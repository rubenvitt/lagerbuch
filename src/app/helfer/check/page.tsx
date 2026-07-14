import { getDb } from "@/db";
import { fahrzeugListe, sollFuerFahrzeug } from "@/db/queries";
import { CheckFlow } from "./CheckFlow";

export const dynamic = "force-dynamic";

export default async function HelferCheckPage({ searchParams }: { searchParams: Promise<{ fz?: string }> }) {
  const { fz } = await searchParams;
  const db = getDb();
  const fahrzeuge = fahrzeugListe(db).filter((f) => f.aktiv);
  // Grabsteine (entfernt) sind auf dem Fahrzeug bewusst nicht vorhanden → nicht Teil des Checks.
  const soll = Object.fromEntries(fahrzeuge.map((f) => [f.id, sollFuerFahrzeug(db, f.id).filter((p) => !p.entfernt)]));
  // Code mit Fahrzeug-Ziel (?fz=…) springt direkt in dessen Check; nur gültige, aktive IDs zählen.
  const preselect = fz && fahrzeuge.some((f) => f.id === fz) ? fz : null;
  return <CheckFlow fahrzeuge={fahrzeuge.map((f) => ({ id: f.id, name: f.name, kennung: f.kennung }))} soll={soll} preselect={preselect} />;
}
