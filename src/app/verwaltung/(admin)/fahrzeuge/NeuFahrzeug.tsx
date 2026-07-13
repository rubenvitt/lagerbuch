"use client";
import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { createFahrzeug } from "@/actions/fahrzeuge";

export function NeuFahrzeug() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kennung, setKennung] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    if (!name.trim()) return;
    setErr(null);
    start(async () => {
      try {
        await createFahrzeug({ name: name.trim(), kennung: kennung.trim() || undefined });
        setName(""); setKennung(""); setOpen(false);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Anlegen fehlgeschlagen");
      }
    });
  }

  if (!open) return <button className="btn btn-tinte slim" onClick={() => setOpen(true)}><Plus size={16} /> Neues Fahrzeug</button>;
  return (
    <div className="drawerdim" onClick={() => setOpen(false)}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="sheettitle">
          <h2>Neues Fahrzeug</h2>
          <button aria-label="Schließen" onClick={() => setOpen(false)}><X size={20} /></button>
        </div>
        <div className="card cardpad" style={{ display: "grid", gap: 12 }}>
          <div>
            <span className="label">Name</span>
            <input className="input" placeholder="z. B. RTW 1" value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
          </div>
          <div>
            <span className="label">Kennung (optional)</span>
            <input className="input" placeholder="z. B. XX-RK 100" value={kennung} onChange={(e) => setKennung(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
          </div>
          {err && <div className="gateerr">{err}</div>}
          <button className="btn btn-rot" disabled={pending || !name.trim()} onClick={submit}><Plus size={16} /> Fahrzeug anlegen</button>
        </div>
      </div>
    </div>
  );
}
