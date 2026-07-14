"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Pencil, Trash2, Check, X } from "lucide-react";
import { renameTemplate, setTemplateAktiv, deleteTemplate, templateAufFahrzeugeSyncen } from "@/actions/templates";

export function TemplateAktionen({ id, name, aktiv, fahrzeuge }: { id: string; name: string; aktiv: boolean; fahrzeuge: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [neu, setNeu] = useState(name);
  const [confirmDel, setConfirmDel] = useState(false);
  const router = useRouter();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
      {edit ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input className="input" value={neu} autoFocus onChange={(e) => setNeu(e.target.value)} />
          <button className="btn btn-rot slim" style={{ width: "auto" }} disabled={pending || !neu.trim()} onClick={() => start(async () => { await renameTemplate({ id, name: neu.trim() }); setEdit(false); })}><Check size={15} /></button>
          <button className="btn btn-ghost slim" style={{ width: "auto" }} onClick={() => { setEdit(false); setNeu(name); }}><X size={15} /></button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {fahrzeuge > 0 && (
            <button className="btn btn-tinte slim" style={{ width: "auto" }} disabled={pending}
              onClick={() => start(async () => { const e = await templateAufFahrzeugeSyncen({ templateId: id }); setMsg(`${e.fahrzeuge} Fahrzeug(e): ${e.hinzugefuegt} neu · ${e.aktualisiert} aktualisiert · ${e.entfernt} entfernt · ${e.uebersprungen} manuell behalten`); })}>
              <RefreshCw size={15} /> Auf Fahrzeuge übertragen
            </button>
          )}
          <button className="btn btn-ghost slim" style={{ width: "auto" }} onClick={() => setEdit(true)}><Pencil size={15} /> Umbenennen</button>
          <button className="btn btn-ghost slim" style={{ width: "auto" }} disabled={pending} onClick={() => start(async () => { await setTemplateAktiv({ id, aktiv: !aktiv }); })}>{aktiv ? "Deaktivieren" : "Aktivieren"}</button>
          {confirmDel ? (
            <button className="btn btn-rot slim" style={{ width: "auto" }} disabled={pending} onClick={() => start(async () => { await deleteTemplate({ id }); router.push("/verwaltung/vorlagen"); })}><Trash2 size={15} /> Wirklich löschen?</button>
          ) : (
            <button className="btn btn-ghost slim" style={{ width: "auto" }} onClick={() => setConfirmDel(true)}><Trash2 size={15} /></button>
          )}
        </div>
      )}
      {msg && <small style={{ color: "var(--stahl)" }}>{msg}</small>}
    </div>
  );
}
