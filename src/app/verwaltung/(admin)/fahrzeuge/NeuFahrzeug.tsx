"use client";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { createFahrzeug } from "@/actions/fahrzeuge";

export function NeuFahrzeug() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kennung, setKennung] = useState("");
  const [pending, start] = useTransition();
  function submit() {
    if (!name.trim()) return;
    start(async () => { await createFahrzeug({ name: name.trim(), kennung: kennung.trim() || undefined }); setName(""); setKennung(""); setOpen(false); });
  }
  if (!open) return <button className="btn btn-tinte" onClick={() => setOpen(true)}><Plus size={16} /> Neues Fahrzeug</button>;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input className="input" placeholder="Name, z. B. RTW 1" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
      <input className="input" placeholder="Kennung (optional)" value={kennung} onChange={(e) => setKennung(e.target.value)} />
      <button className="btn btn-rot" disabled={pending || !name.trim()} onClick={submit}>Anlegen</button>
      <button className="btn btn-ghost" onClick={() => setOpen(false)}>Abbrechen</button>
    </div>
  );
}
