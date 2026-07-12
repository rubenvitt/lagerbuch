"use client";
import { useState, useTransition } from "react";
import { Check, Copy, Download } from "lucide-react";
import { markiereBestellt } from "@/actions/bestellung";

type Zeile = { id: string; name: string; einheit: string; fach: string; bestand: number; mindestbestand: number; vorschlag: number; bestellt: boolean };

function csvCell(s: string | number) { return `"${String(s).replaceAll('"', '""')}"`; }

export function BestellListe({ zeilen }: { zeilen: Zeile[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (zeilen.length === 0) return <div className="card cardpad">Alles über Mindestbestand – nichts zu bestellen.</div>;

  function toggle(z: Zeile) {
    setErr(null);
    start(async () => {
      try { await markiereBestellt({ artikelId: z.id, bestellt: !z.bestellt }); }
      catch (e) { setErr(e instanceof Error ? e.message : "Fehler beim Markieren"); }
    });
  }
  function copyList() {
    const txt = zeilen.filter((z) => !z.bestellt).map((z) => `${z.vorschlag} × ${z.name}`).join("\n");
    navigator.clipboard.writeText(txt).then(() => setMsg("Bestellliste kopiert")).catch(() => setErr("Kopieren fehlgeschlagen"));
  }
  function downloadCsv() {
    const head = ["Artikel", "Bestand", "Mindestbestand", "Vorschlag", "Einheit", "Status"].map(csvCell).join(";");
    const rows = zeilen.map((z) => [z.name, z.bestand, z.mindestbestand, z.vorschlag, z.einheit, z.bestellt ? "bestellt" : "offen"].map(csvCell).join(";"));
    const blob = new Blob([[head, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "bestellvorschlag.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button className="btn btn-ghost" onClick={copyList}><Copy size={15} /> Liste kopieren</button>
        <button className="btn btn-ghost" onClick={downloadCsv}><Download size={15} /> CSV</button>
      </div>
      {msg && <div className="chip chip-ok" style={{ marginBottom: 8, display: "inline-flex", alignItems: "center", gap: 5 }}><Check size={14} /> {msg}</div>}
      {err && <div className="gateerr" style={{ marginBottom: 8 }}>{err}</div>}
      <div className="card">
        {zeilen.map((z) => (
          <div className="row" key={z.id}>
            <button className={`checkcircle ${z.bestellt ? "done" : ""}`} disabled={pending}
              aria-label={z.bestellt ? "Bestellung zurücknehmen" : "Als bestellt markieren"} onClick={() => toggle(z)}>
              {z.bestellt && <Check size={15} />}
            </button>
            <div className="rowmain">
              <div className="rowname" style={z.bestellt ? { textDecoration: "line-through", color: "var(--stahl)" } : undefined}>{z.name}</div>
              <div className="rowmeta"><span className="fach">{z.fach}</span><small>Bestand {z.bestand} / min. {z.mindestbestand}</small>
                {z.bestellt ? <span className="chip chip-ok">bestellt</span> : <span className="chip chip-rot">offen</span>}</div>
            </div>
            <div className="bignum" style={{ fontSize: 20 }}>{z.vorschlag}<small>{z.einheit}</small></div>
          </div>
        ))}
      </div>
    </>
  );
}
