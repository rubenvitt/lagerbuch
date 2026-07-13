"use client";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { flascheSpeichern } from "@/actions/sauerstoff";

export function NeuFlasche({ lagerorte }: { lagerorte: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [lagerortId, setLagerortId] = useState("");
  const [groesse, setGroesse] = useState("");
  const [nenndruck, setNenndruck] = useState("200");
  const [pending, start] = useTransition();

  function submit() {
    if (!name.trim() || !lagerortId) return;
    start(async () => {
      await flascheSpeichern({
        name: name.trim(),
        lagerortId,
        groesseLiter: groesse.trim() ? Number(groesse) : undefined,
        nennfuelldruckBar: nenndruck.trim() ? Number(nenndruck) : 200,
      });
      setName("");
      setLagerortId("");
      setGroesse("");
      setNenndruck("200");
      setOpen(false);
    });
  }

  if (!open) return <button className="btn btn-tinte" onClick={() => setOpen(true)}><Plus size={16} /> Neue Flasche</button>;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input className="input" placeholder="Name, z. B. O2-Flasche 1" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
      <select className="input" value={lagerortId} onChange={(e) => setLagerortId(e.target.value)}>
        <option value="">Lagerort wählen…</option>
        {lagerorte.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
      <input className="input" style={{ width: 110 }} type="number" min={1} placeholder="Größe (l)" value={groesse} onChange={(e) => setGroesse(e.target.value)} />
      <input className="input" style={{ width: 130 }} type="number" min={1} placeholder="Nenndruck bar" value={nenndruck} onChange={(e) => setNenndruck(e.target.value)} />
      <button className="btn btn-rot" disabled={pending || !name.trim() || !lagerortId} onClick={submit}>Anlegen</button>
      <button className="btn btn-ghost" onClick={() => setOpen(false)}>Abbrechen</button>
    </div>
  );
}
