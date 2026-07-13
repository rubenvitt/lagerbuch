"use client";
import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { createToken } from "@/actions/tokens";

type Option = { id: string; name: string };
type ZielMode = "allgemein" | "fahrzeug" | "artikel";

export function NeuToken({ fahrzeuge, artikel }: { fahrzeuge: Option[]; artikel: Option[] }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [labelTouched, setLabelTouched] = useState(false);
  const [mode, setMode] = useState<ZielMode>("allgemein");
  const [zielId, setZielId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reset() {
    setLabel(""); setLabelTouched(false); setMode("allgemein"); setZielId(""); setErr(null);
  }

  // Label folgt dem gewählten Ziel, solange der Nutzer es nicht selbst angefasst hat.
  function waehleZiel(liste: Option[], id: string) {
    setZielId(id);
    if (!labelTouched) setLabel(liste.find((o) => o.id === id)?.name ?? "");
  }

  function submit() {
    if (!label.trim()) return;
    if (mode !== "allgemein" && !zielId) { setErr("Bitte ein Ziel auswählen."); return; }
    setErr(null);
    start(async () => {
      try {
        await createToken({
          label: label.trim(),
          zielTyp: mode === "allgemein" ? undefined : mode,
          zielId: mode === "allgemein" ? undefined : zielId,
        });
        reset();
        setOpen(false);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Anlegen fehlgeschlagen");
      }
    });
  }

  if (!open) {
    return (
      <button className="btn btn-tinte slim" onClick={() => setOpen(true)}>
        <Plus size={16} /> Neuer Code
      </button>
    );
  }

  const liste = mode === "fahrzeug" ? fahrzeuge : mode === "artikel" ? artikel : [];

  return (
    <div className="drawerdim" onClick={() => setOpen(false)}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="sheettitle">
          <h2>Neuer Zugangs-Code</h2>
          <button aria-label="Schließen" onClick={() => setOpen(false)}><X size={20} /></button>
        </div>
        <div className="card cardpad" style={{ display: "grid", gap: 12 }}>
          <div>
            <span className="label">Ziel des Codes</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {([
                { m: "fahrzeug", t: "Fahrzeug" },
                { m: "artikel", t: "Material im Handlager" },
                { m: "allgemein", t: "Allgemein (Artikel-Liste)" },
              ] as const).map(({ m, t }) => (
                <button
                  key={m}
                  className={`btn slim ${mode === m ? "btn-tinte" : "btn-ghost"}`}
                  style={{ width: "auto" }}
                  onClick={() => { setMode(m); setZielId(""); setErr(null); if (!labelTouched) setLabel(""); }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {mode !== "allgemein" && (
            <div>
              <span className="label">{mode === "fahrzeug" ? "Fahrzeug" : "Artikel"}</span>
              <select className="input" value={zielId} onChange={(e) => waehleZiel(liste, e.target.value)}>
                <option value="">{mode === "fahrzeug" ? "Fahrzeug wählen…" : "Artikel wählen…"}</option>
                {liste.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              {liste.length === 0 && (
                <small style={{ color: "var(--stahl)" }}>Noch keine {mode === "fahrzeug" ? "Fahrzeuge" : "Artikel"} angelegt.</small>
              )}
            </div>
          )}

          <div>
            <span className="label">Beschriftung (aufs Etikett)</span>
            <input
              className="input"
              placeholder="z. B. RTW 1 · Fach A2"
              value={label}
              autoFocus
              onChange={(e) => { setLabel(e.target.value); setLabelTouched(true); }}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>

          {err && <div className="gateerr">{err}</div>}
          <button className="btn btn-rot" disabled={pending || !label.trim() || (mode !== "allgemein" && !zielId)} onClick={submit}>
            <Plus size={16} /> Code anlegen
          </button>
        </div>
      </div>
    </div>
  );
}
