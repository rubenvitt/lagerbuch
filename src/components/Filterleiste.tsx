"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

export type FilterChip = {
  label: string;
  aktiv: boolean;
  onToggle: () => void;
  icon?: ReactNode;
};

/** Immutables Umschalten eines Werts in einem Set (für Mehrfach-Filter-Chips). */
export function toggleInSet<T>(set: Set<T>, item: T): Set<T> {
  const next = new Set(set);
  if (next.has(item)) next.delete(item);
  else next.add(item);
  return next;
}

/**
 * Hook für URL-getriebene Filter (Journal/Checks): liefert eine Funktion, die die übergebenen
 * Parameter (leere Werte werden ausgelassen) per router.replace in die URL schreibt — ohne
 * History-Spam und ohne Scroll-Sprung. Leeres Objekt ⇒ alle Filter zurücksetzen.
 */
export function useUrlFilter() {
  const router = useRouter();
  const pathname = usePathname();
  return (params: Record<string, string>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
}

/** Zeitraum-Auswahl (von/bis) als Paar von Datumsfeldern mit gegenseitiger min/max-Begrenzung. */
export function ZeitraumFelder({
  von,
  bis,
  onVon,
  onBis,
}: {
  von: string;
  bis: string;
  onVon: (wert: string) => void;
  onBis: (wert: string) => void;
}) {
  return (
    <>
      <input
        className="input"
        type="date"
        name="von"
        style={{ width: "auto", padding: "6px 10px" }}
        value={von}
        max={bis || undefined}
        onChange={(e) => onVon(e.target.value)}
        aria-label="Zeitraum von"
      />
      <span style={{ color: "var(--stahl)" }}>–</span>
      <input
        className="input"
        type="date"
        name="bis"
        style={{ width: "auto", padding: "6px 10px" }}
        value={bis}
        min={von || undefined}
        onChange={(e) => onBis(e.target.value)}
        aria-label="Zeitraum bis"
      />
    </>
  );
}

/**
 * Wiederverwendbare Such-/Filter-Leiste über einer Liste/Tabelle: Freitext-Suchfeld + optionale
 * Filter-Chips (Mehrfach- oder exklusive Auswahl entscheidet die aufrufende Komponente über die
 * `aktiv`-Flags). Rein präsentativ — State/Filterlogik liegt bei der jeweiligen Listen-Komponente.
 * Nutzt ausschließlich bestehende CSS-Bausteine (.filterleiste/.suchfeld/.input/.filters/.filter).
 */
export function Filterleiste({
  suche,
  onSuche,
  platzhalter,
  chips = [],
  extra,
  treffer,
}: {
  suche: string;
  onSuche: (wert: string) => void;
  platzhalter: string;
  chips?: FilterChip[];
  /** Zusätzliche Controls rechts neben den Chips (z. B. Zeitraum-Datumsfelder). */
  extra?: ReactNode;
  /** Optionale Treffer-Anzeige; wird nur gezeigt, wenn gefiltert wurde (gezeigt !== gesamt). */
  treffer?: { gezeigt: number; gesamt: number };
}) {
  return (
    <div className="filterleiste">
      <label className="suchfeld">
        <Search size={15} aria-hidden />
        <input
          className="input"
          type="search"
          name="suche"
          value={suche}
          onChange={(e) => onSuche(e.target.value)}
          placeholder={platzhalter}
          aria-label={platzhalter}
        />
      </label>
      {chips.length > 0 && (
        <div className="filters" role="group" aria-label="Filter">
          {chips.map((c, i) => (
            <button
              key={i}
              type="button"
              className={`filter${c.aktiv ? " on" : ""}`}
              aria-pressed={c.aktiv}
              onClick={c.onToggle}
            >
              {c.icon}
              {c.label}
            </button>
          ))}
        </div>
      )}
      {extra}
      {treffer && treffer.gezeigt !== treffer.gesamt && (
        <span className="filtertreffer">
          {treffer.gezeigt} von {treffer.gesamt}
        </span>
      )}
    </div>
  );
}
