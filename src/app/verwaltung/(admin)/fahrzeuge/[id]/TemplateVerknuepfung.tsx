"use client";
import { useState, useTransition } from "react";
import { RefreshCw, Link2, Link2Off, Copy } from "lucide-react";
import { fahrzeugTemplateZuweisen, fahrzeugTemplateSync, fahrzeugTemplateLoesen, templateAusFahrzeug } from "@/actions/templates";
import type { SyncErgebnis as SyncErgebnisView } from "@/db/template-sync";

type TemplateOption = { id: string; name: string };

function fmtSync(e: SyncErgebnisView): string {
  const teile: string[] = [];
  if (e.hinzugefuegt) teile.push(`${e.hinzugefuegt} neu`);
  if (e.aktualisiert) teile.push(`${e.aktualisiert} aktualisiert`);
  if (e.entfernt) teile.push(`${e.entfernt} entfernt`);
  if (e.losgeloest) teile.push(`${e.losgeloest} losgelöst`);
  if (e.uebersprungen) teile.push(`${e.uebersprungen} manuell behalten`);
  return teile.length ? teile.join(" · ") : "keine Änderungen";
}

export function TemplateVerknuepfung({
  fahrzeugId, templateId, templateName, templates, hatPositionen,
}: { fahrzeugId: string; templateId: string | null; templateName: string | null; templates: TemplateOption[]; hatPositionen: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [wechseln, setWechseln] = useState(false);
  const [wahl, setWahl] = useState("");
  const [neuName, setNeuName] = useState("");
  const [neuOpen, setNeuOpen] = useState(false);

  if (templateId) {
    return (
      <div className="card cardpad" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontWeight: 600 }}>Vorlage: {templateName ?? "–"}</div>
          {msg && <small style={{ color: "var(--stahl)" }}>{msg}</small>}
        </div>
        <button className="btn btn-ghost slim" style={{ width: "auto" }} disabled={pending}
          onClick={() => start(async () => { const e = await fahrzeugTemplateSync({ fahrzeugId }); setMsg(`Sync: ${fmtSync(e)}`); })}>
          <RefreshCw size={15} /> Sync
        </button>
        <button className="btn btn-ghost slim" style={{ width: "auto" }} disabled={pending}
          onClick={() => start(async () => { await fahrzeugTemplateLoesen({ fahrzeugId }); setMsg("Verknüpfung gelöst – Positionen bleiben als individuelle Bestückung."); })}>
          <Link2Off size={15} /> Verknüpfung lösen
        </button>
      </div>
    );
  }

  return (
    <div className="card cardpad" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontWeight: 600 }}>Keine Vorlage</div>
        <small style={{ color: "var(--stahl)" }}>{msg ?? "Individuell gepackt. Vorlage zuweisen oder aus diesem Fahrzeug erstellen."}</small>
      </div>
      {!wechseln && !neuOpen && (
        <>
          {templates.length > 0 && (
            <button className="btn btn-ghost slim" style={{ width: "auto" }} onClick={() => setWechseln(true)}><Link2 size={15} /> Vorlage zuweisen</button>
          )}
          {hatPositionen && (
            <button className="btn btn-ghost slim" style={{ width: "auto" }} onClick={() => setNeuOpen(true)}><Copy size={15} /> Vorlage aus Fahrzeug</button>
          )}
        </>
      )}
      {wechseln && (
        <>
          <select className="input" value={wahl} onChange={(e) => setWahl(e.target.value)} style={{ minWidth: 160 }}>
            <option value="">Vorlage wählen…</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button className="btn btn-rot" disabled={pending || !wahl} onClick={() => start(async () => { const e = await fahrzeugTemplateZuweisen({ fahrzeugId, templateId: wahl }); setMsg(`Zugewiesen · ${fmtSync(e)}`); setWechseln(false); })}>Zuweisen</button>
          <button className="btn btn-ghost slim" style={{ width: "auto" }} onClick={() => setWechseln(false)}>Abbrechen</button>
        </>
      )}
      {neuOpen && (
        <>
          <input className="input" placeholder="Name der Vorlage" value={neuName} autoFocus onChange={(e) => setNeuName(e.target.value)} style={{ minWidth: 160 }} />
          <button className="btn btn-rot" disabled={pending || !neuName.trim()} onClick={() => start(async () => { await templateAusFahrzeug({ fahrzeugId, name: neuName.trim(), verknuepfen: true }); setMsg("Vorlage erstellt und verknüpft."); setNeuOpen(false); setNeuName(""); })}>Erstellen</button>
          <button className="btn btn-ghost slim" style={{ width: "auto" }} onClick={() => setNeuOpen(false)}>Abbrechen</button>
        </>
      )}
    </div>
  );
}
