import { getDb } from "@/db";
import { fahrzeugUebersicht } from "@/db/queries";
import { NeuFahrzeug } from "./NeuFahrzeug";
import { FahrzeugeListe } from "./FahrzeugeListe";

export const dynamic = "force-dynamic";

export default function FahrzeugePage() {
  const fahrzeuge = fahrzeugUebersicht(getDb());
  return (
    <>
      <div className="mainhead">
        <h1>Fahrzeuge</h1>
        <NeuFahrzeug />
      </div>
      <FahrzeugeListe fahrzeuge={fahrzeuge} />
    </>
  );
}
