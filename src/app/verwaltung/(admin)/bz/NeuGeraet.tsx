"use client";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { geraetSpeichern } from "@/actions/bz";

type LagerortOption = { id: string; name: string; typ: "lager" | "fahrzeug" };

export function NeuGeraet({ lagerorte }: { lagerorte: LagerortOption[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [lagerortId, setLagerortId] = useState(lagerorte[0]?.id ?? "");
  const [pending, start] = useTransition();

  function submit() {
    if (!name.trim() || !lagerortId) return;
    start(async () => {
      await geraetSpeichern({ name: name.trim(), barcode: barcode.trim() || undefined, lagerortId });
      setName("");
      setBarcode("");
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button className="btn btn-tinte" onClick={() => setOpen(true)} disabled={lagerorte.length === 0}>
        <Plus size={16} /> Neues Gerät
      </button>
    );
  }
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input className="input" style={{ width: "auto" }} placeholder="Name, z. B. Accu-Chek" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
      <input className="input" style={{ width: "auto" }} placeholder="Barcode (optional)" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
      <select className="input" style={{ width: "auto" }} value={lagerortId} onChange={(e) => setLagerortId(e.target.value)}>
        {lagerorte.map((l) => (
          <option key={l.id} value={l.id}>{l.name}</option>
        ))}
      </select>
      <button className="btn btn-rot" disabled={pending || !name.trim() || !lagerortId} onClick={submit}>Anlegen</button>
      <button className="btn btn-ghost" onClick={() => setOpen(false)}>Abbrechen</button>
    </div>
  );
}
