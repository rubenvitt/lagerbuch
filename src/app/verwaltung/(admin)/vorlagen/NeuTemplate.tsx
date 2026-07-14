"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createTemplate } from "@/actions/templates";

export function NeuTemplate() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  function submit() {
    if (!name.trim()) return;
    start(async () => {
      const { id } = await createTemplate({ name: name.trim() });
      setName(""); setOpen(false);
      router.push(`/verwaltung/vorlagen/${id}`);
    });
  }
  if (!open) return <button className="btn btn-tinte" onClick={() => setOpen(true)}><Plus size={16} /> Neue Vorlage</button>;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input className="input" placeholder="Name, z. B. RTW-Standard" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
      <button className="btn btn-rot" disabled={pending || !name.trim()} onClick={submit}>Anlegen</button>
      <button className="btn btn-ghost" onClick={() => setOpen(false)}>Abbrechen</button>
    </div>
  );
}
