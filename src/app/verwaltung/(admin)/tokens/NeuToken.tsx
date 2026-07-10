"use client";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { createToken } from "@/actions/tokens";

export function NeuToken() {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    if (!label.trim()) return;
    start(async () => {
      await createToken({ label: label.trim() });
      setLabel("");
      setOpen(false);
    });
  }

  if (!open) return <button className="btn btn-tinte" onClick={() => setOpen(true)}><Plus size={16} /> Neuer Code</button>;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input className="input" placeholder="Label, z. B. RTW 1" value={label} autoFocus
        onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
      <button className="btn btn-rot" disabled={pending || !label.trim()} onClick={submit}>Anlegen</button>
      <button className="btn btn-ghost" onClick={() => setOpen(false)}>Abbrechen</button>
    </div>
  );
}
