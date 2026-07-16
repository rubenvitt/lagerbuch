import { getDb } from "@/db";
import { fahrzeugListe, sollFuerFahrzeug } from "@/db/queries";
import { geraeteFuerLagerort } from "@/db/geraete";
import { o2FlaschenFuerLagerort } from "@/db/sauerstoff";
import { CheckFlow } from "./CheckFlow";

export const dynamic = "force-dynamic";

export default async function HelferCheckPage({ searchParams }: { searchParams: Promise<{ fz?: string }> }) {
  const { fz } = await searchParams;
  const db = getDb();
  const fahrzeuge = fahrzeugListe(db).filter((f) => f.aktiv);
  // Grabsteine (entfernt) sind auf dem Fahrzeug bewusst nicht vorhanden → nicht Teil des Checks.
  const soll = Object.fromEntries(fahrzeuge.map((f) => [f.id, sollFuerFahrzeug(db, f.id).filter((p) => !p.entfernt)]));
  // Geräte am Fahrzeug (standort-basiert) → Quittier-Schritt im Check.
  const geraete = Object.fromEntries(
    fahrzeuge.map((f) => [f.id, geraeteFuerLagerort(db, f.id).map((g) => ({ id: g.id, typ: g.typ, name: g.name }))]),
  );
  // Sauerstoffflaschen am Fahrzeug (standort-basiert) → Druck-Ablese-Schritt im Check.
  const flaschen = Object.fromEntries(fahrzeuge.map((f) => [f.id, o2FlaschenFuerLagerort(db, f.id)]));
  // Code mit Fahrzeug-Ziel (?fz=…) springt direkt in dessen Check; nur gültige, aktive IDs zählen.
  const preselect = fz && fahrzeuge.some((f) => f.id === fz) ? fz : null;
  return (
    <CheckFlow
      fahrzeuge={fahrzeuge.map((f) => ({ id: f.id, name: f.name, kennung: f.kennung }))}
      soll={soll}
      geraete={geraete}
      flaschen={flaschen}
      preselect={preselect}
    />
  );
}
