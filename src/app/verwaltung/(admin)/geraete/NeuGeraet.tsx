"use client";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { GeraetForm } from "./GeraetForm";

type LagerortOption = { id: string; name: string; typ: "lager" | "fahrzeug" };

export function NeuGeraet({ lagerorte }: { lagerorte: LagerortOption[] }) {
  const [open, setOpen] = useState(false);

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
          <h2>Neues Gerät</h2>
          <button aria-label="Schließen" onClick={() => setOpen(false)}><X size={20} /></button>
        </div>
        <GeraetForm lagerorte={lagerorte} onSaved={() => setOpen(false)} />
      </div>
    </div>
  );
}
