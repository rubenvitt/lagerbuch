"use client";
import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { flascheSpeichern } from "@/actions/sauerstoff";
import { Combobox } from "@/components/Combobox";

export function NeuFlasche({ lagerorte }: { lagerorte: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [lagerortId, setLagerortId] = useState("");
  const [groesse, setGroesse] = useState("");
  const [nenndruck, setNenndruck] = useState("200");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    if (!name.trim() || !lagerortId) return;
    setErr(null);
    start(async () => {
      try {
        await flascheSpeichern({
          name: name.trim(),
          lagerortId,
          groesseLiter: groesse.trim() ? Number(groesse) : undefined,
          nennfuelldruckBar: nenndruck.trim() ? Number(nenndruck) : 200,
        });
        setName(""); setLagerortId(""); setGroesse(""); setNenndruck("200"); setOpen(false);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Anlegen fehlgeschlagen");
      }
    });
  }

  if (!open) return <button className="btn btn-tinte slim" onClick={() => setOpen(true)}><Plus size={16} /> Neue Flasche</button>;
  return (
    <div className="drawerdim" onClick={() => setOpen(false)}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="sheettitle">
          <h2>Neue O₂-Flasche</h2>
          <button aria-label="Schließen" onClick={() => setOpen(false)}><X size={20} /></button>
        </div>
        <div className="card cardpad" style={{ display: "grid", gap: 12 }}>
          <div>
            <span className="label">Name</span>
            <input className="input" placeholder="z. B. O2-Flasche 1" value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
          </div>
          <div>
            <span className="label">Standort</span>
            <Combobox
              options={lagerorte.map((l) => ({ value: l.id, label: l.name }))}
              value={lagerortId}
              onChange={setLagerortId}
              placeholder="Lagerort wählen…"
              emptyText="Kein Lagerort gefunden"
              ariaLabel="Standort"
            />
          </div>
          <div className="grid2">
            <div>
              <span className="label">Größe (l)</span>
              <input className="input" type="number" min={1} placeholder="z. B. 2" value={groesse} onChange={(e) => setGroesse(e.target.value)} />
            </div>
            <div>
              <span className="label">Nenndruck (bar)</span>
              <input className="input" type="number" min={1} value={nenndruck} onChange={(e) => setNenndruck(e.target.value)} />
            </div>
          </div>
          {err && <div className="gateerr">{err}</div>}
          <button className="btn btn-rot" disabled={pending || !name.trim() || !lagerortId} onClick={submit}><Plus size={16} /> Flasche anlegen</button>
        </div>
      </div>
    </div>
  );
}
