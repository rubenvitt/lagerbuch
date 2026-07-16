"use client";

import { useEffect, useRef, useState } from "react";
import { Filterleiste, ZeitraumFelder, useUrlFilter, type FilterChip } from "@/components/Filterleiste";

const TYPEN = [
  { wert: "zugang", label: "Wareneingang" },
  { wert: "entnahme", label: "Entnahme" },
  { wert: "korrektur", label: "Korrektur" },
  { wert: "umlagerung", label: "Umlagerung" },
] as const;

type JournalParams = { q: string; typ: string; von: string; bis: string };

/**
 * Filterleiste fürs Journal. State lebt in der URL (searchParams) — der Server rendert das
 * gefilterte Ergebnis, damit über die GESAMTE Historie gesucht wird (nicht nur im Limit-Fenster).
 * Die aktuellen Werte kommen als Props von der Server-Page; neue URLs werden daraus + dem
 * geänderten Feld gebaut. Freitext wird debounced navigiert.
 *
 * `committedQ` merkt sich den zuletzt selbst in die URL geschriebenen Suchbegriff. Damit lässt sich
 * eine EXTERNE q-Änderung (Browser-Zurück/-Vor, geteilter Link) von einer selbst ausgelösten
 * unterscheiden: extern ⇒ Eingabe nachziehen (ohne erneut zu navigieren, sonst würde ein
 * Zurück-Klick ~300 ms später rückgängig gemacht); selbst ⇒ nichts tun (Fokus bleibt beim Tippen).
 */
export function JournalFilter({ q, typ, von, bis }: JournalParams) {
  const setzeUrl = useUrlFilter();
  const [suche, setSuche] = useState(q);
  const committedQ = useRef(q);

  useEffect(() => {
    if (q !== committedQ.current) {
      committedQ.current = q;
      setSuche(q);
    }
  }, [q]);

  // Sofort-Navigation für Chips/Datum. Bereits Getipptes (suche) wird als q mit übernommen.
  const setParam = (patch: Partial<JournalParams>) => {
    committedQ.current = suche.trim();
    setzeUrl({ q: suche.trim(), typ, von, bis, ...patch });
  };

  // Debounce für die Freitextsuche (jede Änderung löst eine RSC-Navigation aus).
  useEffect(() => {
    const term = suche.trim();
    if (term === committedQ.current) return;
    const t = setTimeout(() => {
      committedQ.current = term;
      setzeUrl({ q: term, typ, von, bis });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suche, typ, von, bis]);

  const reset = () => {
    committedQ.current = "";
    setSuche("");
    setzeUrl({});
  };

  const chips: FilterChip[] = TYPEN.map((t) => ({
    label: t.label,
    aktiv: typ === t.wert,
    onToggle: () => setParam({ typ: typ === t.wert ? "" : t.wert }),
  }));

  const extra = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <ZeitraumFelder von={von} bis={bis} onVon={(v) => setParam({ von: v })} onBis={(v) => setParam({ bis: v })} />
      {(q || typ || von || bis) && (
        <button type="button" className="filter" onClick={reset}>
          zurücksetzen
        </button>
      )}
    </span>
  );

  return (
    <Filterleiste
      suche={suche}
      onSuche={setSuche}
      platzhalter="Artikel oder Kommentar suchen…"
      chips={chips}
      extra={extra}
    />
  );
}
