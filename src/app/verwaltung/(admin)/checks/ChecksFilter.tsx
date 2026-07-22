"use client";

import { useUrlFilter, ZeitraumFelder } from "@/components/Filterleiste";
import { Combobox, type ComboOption } from "@/components/Combobox";

type FahrzeugOption = { id: string; name: string; kennung: string | null };
type ChecksParams = { fz: string; von: string; bis: string };

/**
 * Filterleiste für die Fahrzeug-Checks. State lebt in der URL (searchParams), damit über die
 * gesamte Check-Historie serverseitig gefiltert wird (nicht nur im geladenen Limit-Fenster).
 * Fahrzeug als Dropdown (überschaubare Flotte) + Zeitraum. Werte kommen als Props von der
 * Server-Page.
 */
export function ChecksFilter({ fz, von, bis, fahrzeuge }: ChecksParams & { fahrzeuge: FahrzeugOption[] }) {
  const setzeUrl = useUrlFilter();
  const setParam = (patch: Partial<ChecksParams>) => setzeUrl({ fz, von, bis, ...patch });

  // „Alle Fahrzeuge“ bleibt oben, die Flotte selbst A–Z – daher selbst sortiert (Combobox: sort=false).
  const fahrzeugOptionen: ComboOption[] = [
    { value: "", label: "Alle Fahrzeuge" },
    ...[...fahrzeuge]
      .sort((a, b) => a.name.localeCompare(b.name, "de"))
      .map((f) => ({
        value: f.id,
        label: f.kennung ? `${f.name} · ${f.kennung}` : f.name,
        keywords: f.kennung ?? "",
      })),
  ];

  return (
    <div className="filterleiste">
      <Combobox
        options={fahrzeugOptionen}
        value={fz}
        onChange={(v) => setParam({ fz: v })}
        placeholder="Alle Fahrzeuge"
        emptyText="Kein Fahrzeug gefunden"
        ariaLabel="Fahrzeug"
        sort={false}
        style={{ flex: "0 1 260px" }}
      />
      <span className="label" style={{ margin: 0 }}>Zeitraum</span>
      <ZeitraumFelder von={von} bis={bis} onVon={(v) => setParam({ von: v })} onBis={(v) => setParam({ bis: v })} />
      {(fz || von || bis) && (
        <button type="button" className="filter" onClick={() => setzeUrl({})}>
          zurücksetzen
        </button>
      )}
    </div>
  );
}
