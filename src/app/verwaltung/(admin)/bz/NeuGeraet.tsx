"use client";
import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { geraetSpeichern } from "@/actions/bz";
import { Combobox } from "@/components/Combobox";

type LagerortOption = { id: string; name: string; typ: "lager" | "fahrzeug" };

export function NeuGeraet({ lagerorte }: { lagerorte: LagerortOption[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [lagerortId, setLagerortId] = useState(lagerorte[0]?.id ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    if (!name.trim() || !lagerortId) return;
    setErr(null);
    start(async () => {
      try {
        await geraetSpeichern({ name: name.trim(), barcode: barcode.trim() || undefined, lagerortId });
        setName(""); setBarcode(""); setOpen(false);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Anlegen fehlgeschlagen");
      }
    });
  }

  if (!open) {
    return (
      <button className="btn btn-tinte slim" onClick={() => setOpen(true)} disabled={lagerorte.length === 0}>
        <Plus size={16} /> Neues Gerät
      </button>
    );
  }
  return (
    <div className="drawerdim" onClick={() => setOpen(false)}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="sheettitle">
          <h2>Neues BZ-Gerät</h2>
          <button aria-label="Schließen" onClick={() => setOpen(false)}><X size={20} /></button>
        </div>
        <div className="card cardpad" style={{ display: "grid", gap: 12 }}>
          <div>
            <span className="label">Name</span>
            <input className="input" placeholder="z. B. Accu-Chek" value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
          </div>
          <div>
            <span className="label">Barcode (optional)</span>
            <input className="input" placeholder="Barcode / Seriennummer" value={barcode} onChange={(e) => setBarcode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
          </div>
          <div>
            <span className="label">Standort</span>
            <Combobox
              options={lagerorte.map((l) => ({ value: l.id, label: l.name }))}
              value={lagerortId}
              onChange={setLagerortId}
              placeholder="Standort wählen…"
              emptyText="Kein Standort gefunden"
              ariaLabel="Standort"
            />
          </div>
          {err && <div className="gateerr">{err}</div>}
          <button className="btn btn-rot" disabled={pending || !name.trim() || !lagerortId} onClick={submit}><Plus size={16} /> Gerät anlegen</button>
        </div>
      </div>
    </div>
  );
}
