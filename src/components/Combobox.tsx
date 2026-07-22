"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronsUpDown } from "lucide-react";

export type ComboOption = {
  /** Rückgabewert (z. B. Artikel-ID). Für die „nichts gewählt“-Zeile leer lassen. */
  value: string;
  /** Angezeigter Text – hiernach wird sortiert und gesucht. */
  label: string;
  /** Zusätzliche, nicht sichtbare Suchbegriffe (z. B. Fach, Kennung). */
  keywords?: string;
};

type ComboboxProps = {
  options: ComboOption[];
  value: string;
  onChange: (value: string) => void;
  /** Platzhalter, solange nichts gewählt ist. */
  placeholder?: string;
  disabled?: boolean;
  /** Optionen alphabetisch (de) sortieren. Standard: an. */
  sort?: boolean;
  emptyText?: string;
  ariaLabel?: string;
  id?: string;
  className?: string;
  style?: CSSProperties;
};

type PanelPos = { left: number; top: number; width: number; maxHeight: number; oben: boolean };

/**
 * Suchbares Dropdown: sieht aus wie ein `.input`, verhält sich aber wie eine Combobox.
 * Bei langen Listen (Artikel, Fahrzeuge, Lagerorte …) tippt man statt zu scrollen; die
 * Einträge sind standardmäßig A–Z sortiert. Voll tastaturbedienbar (↑/↓, Enter, Esc).
 *
 * Das Panel wird per Portal mit `position: fixed` gerendert, damit es nicht an
 * `overflow: hidden`-Karten oder scrollenden Drawern abgeschnitten wird; bei zu wenig
 * Platz nach unten klappt es nach oben auf.
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Wählen…",
  disabled = false,
  sort = true,
  emptyText = "Kein Treffer",
  ariaLabel,
  id,
  className,
  style,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<PanelPos | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const sortiert = useMemo(() => {
    if (!sort) return options;
    return [...options].sort((a, b) => a.label.localeCompare(b.label, "de"));
  }, [options, sort]);

  const gewaehlt = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value]);

  const gefiltert = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortiert;
    return sortiert.filter((o) => `${o.label} ${o.keywords ?? ""}`.toLowerCase().includes(q));
  }, [sortiert, query]);

  const berechnePos = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const platzUnten = window.innerHeight - r.bottom - 8;
    const platzOben = r.top - 8;
    const oben = platzUnten < 200 && platzOben > platzUnten;
    setPos({
      left: r.left,
      top: oben ? r.top : r.bottom,
      width: r.width,
      maxHeight: Math.min(264, Math.max(140, (oben ? platzOben : platzUnten))),
      oben,
    });
  }, []);

  // Position berechnen, sobald geöffnet, und bei Scroll/Resize nachführen.
  useEffect(() => {
    if (!open) return;
    berechnePos();
    window.addEventListener("scroll", berechnePos, true);
    window.addEventListener("resize", berechnePos);
    return () => {
      window.removeEventListener("scroll", berechnePos, true);
      window.removeEventListener("resize", berechnePos);
    };
  }, [open, berechnePos]);

  // Klick außerhalb (Eingabe UND Portal-Panel) schließt und verwirft die Sucheingabe.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
      setQuery("");
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Markierung im gültigen Bereich halten und in den sichtbaren Bereich scrollen.
  useEffect(() => {
    if (active > gefiltert.length - 1) setActive(gefiltert.length ? gefiltert.length - 1 : 0);
  }, [gefiltert.length, active]);

  useEffect(() => {
    if (!open || !panelRef.current) return;
    const el = panelRef.current.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function oeffne() {
    if (disabled || open) return;
    setOpen(true);
    setQuery("");
    const i = gewaehlt ? sortiert.findIndex((o) => o.value === gewaehlt.value) : 0;
    setActive(i < 0 ? 0 : i);
  }

  function schliesse() {
    setOpen(false);
    setQuery("");
  }

  function waehle(opt: ComboOption) {
    onChange(opt.value);
    schliesse();
    inputRef.current?.blur();
  }

  function onKey(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        oeffne();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, gefiltert.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = gefiltert[active];
      if (opt) waehle(opt);
    } else if (e.key === "Escape") {
      e.preventDefault();
      schliesse();
      inputRef.current?.blur();
    }
  }

  const listId = id ? `${id}-liste` : undefined;

  return (
    <div ref={rootRef} className={`combo${className ? ` ${className}` : ""}`} style={style}>
      <input
        ref={inputRef}
        id={id}
        className="combo-input"
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        autoComplete="off"
        disabled={disabled}
        placeholder={gewaehlt ? gewaehlt.label : placeholder}
        value={open ? query : gewaehlt?.label ?? ""}
        onChange={(e) => {
          if (!open) oeffne();
          setQuery(e.target.value);
          setActive(0);
        }}
        onFocus={oeffne}
        onMouseDown={oeffne}
        onKeyDown={onKey}
      />
      <ChevronsUpDown className="combo-chevron" size={15} aria-hidden />
      {open && pos && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            id={listId}
            role="listbox"
            className="combo-panel"
            style={{
              left: pos.left,
              width: pos.width,
              maxHeight: pos.maxHeight,
              ...(pos.oben
                ? { bottom: window.innerHeight - pos.top + 4 }
                : { top: pos.top + 4 }),
            }}
          >
            {gefiltert.length === 0 ? (
              <div className="combo-empty">{emptyText}</div>
            ) : (
              gefiltert.map((o, i) => (
                <div
                  key={o.value}
                  role="option"
                  aria-selected={o.value === value}
                  className={`combo-opt${i === active ? " active" : ""}${o.value === value ? " sel" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    waehle(o);
                  }}
                >
                  <span className="combo-optlabel">{o.label}</span>
                  {o.value === value && <Check size={14} className="combo-check" />}
                </div>
              ))
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
