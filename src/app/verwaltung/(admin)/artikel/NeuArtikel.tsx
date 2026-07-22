"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Stepper } from "@/components/Stepper";
import { createArtikel } from "@/actions/artikel";
import { Combobox } from "@/components/Combobox";

const EINHEITEN = ["Stk.", "Pkg.", "Fl.", "Box"];

export function NeuArtikel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [einheit, setEinheit] = useState<string>(EINHEITEN[0]);
  const [fach, setFach] = useState("");
  const [mindestbestand, setMindestbestand] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function anlegen() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await createArtikel({ name: name.trim(), einheit, fach: fach.trim(), mindestbestand });
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Anlegen fehlgeschlagen");
      setBusy(false);
    }
  }

  return (
    <div className="drawerdim" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="sheettitle">
          <h2>Neuer Artikel</h2>
          <button aria-label="Schließen" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="card cardpad" style={{ display: "grid", gap: 12 }}>
          <div>
            <span className="label">Bezeichnung</span>
            <input
              className="input"
              placeholder="z. B. Beatmungsfilter HME"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid2">
            <div>
              <span className="label">Einheit</span>
              <Combobox
                options={EINHEITEN.map((u) => ({ value: u, label: u }))}
                value={einheit}
                onChange={setEinheit}
                sort={false}
                ariaLabel="Einheit"
              />
            </div>
            <div>
              <span className="label">Fach</span>
              <input className="input" value={fach} onChange={(e) => setFach(e.target.value.toUpperCase())} />
            </div>
          </div>
          <div>
            <span className="label">Mindestbestand</span>
            <Stepper sm min={0} wert={mindestbestand} setWert={setMindestbestand} />
          </div>
          {error && <div style={{ color: "var(--rot)", fontSize: 12.5, fontWeight: 600 }}>{error}</div>}
          <button className="btn btn-rot" disabled={!name.trim() || busy} onClick={anlegen}>
            <Plus size={16} /> Artikel anlegen
          </button>
        </div>
      </div>
    </div>
  );
}
