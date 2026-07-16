"use client";

import { useUrlFilter, ZeitraumFelder } from "@/components/Filterleiste";

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

  return (
    <div className="filterleiste">
      <select
        className="input"
        name="fahrzeug"
        style={{ width: "auto", flex: "0 1 260px" }}
        value={fz}
        onChange={(e) => setParam({ fz: e.target.value })}
        aria-label="Fahrzeug"
      >
        <option value="">Alle Fahrzeuge</option>
        {fahrzeuge.map((f) => (
          <option key={f.id} value={f.id}>
            {f.kennung ? `${f.name} · ${f.kennung}` : f.name}
          </option>
        ))}
      </select>
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
