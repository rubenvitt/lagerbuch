import { getDb } from "@/db";
import { fahrzeugListe, sollFuerFahrzeug } from "@/db/queries";
import { CheckFlow } from "./CheckFlow";

export const dynamic = "force-dynamic";

export default function HelferCheckPage() {
  const db = getDb();
  const fahrzeuge = fahrzeugListe(db).filter((f) => f.aktiv);
  const soll = Object.fromEntries(fahrzeuge.map((f) => [f.id, sollFuerFahrzeug(db, f.id)]));
  return <CheckFlow fahrzeuge={fahrzeuge.map((f) => ({ id: f.id, name: f.name, kennung: f.kennung }))} soll={soll} />;
}
