"use client";
import { useMemo, useState, useTransition } from "react";
import { Check, AlertTriangle, ArrowRight, PackageCheck } from "lucide-react";
import { Stepper } from "@/components/Stepper";
import { checkAbschluss } from "@/actions/check";

type Pos = {
  id: string; fachLabel: string; artikelId: string; artikelName: string; einheit: string;
  handlagerFach: string; soll: number; fahrzeugBestand: number; handlagerBestand: number;
};
type Fahrzeug = { id: string; name: string; kennung: string | null };

export function CheckFlow({ fahrzeuge, soll }: { fahrzeuge: Fahrzeug[]; soll: Record<string, Pos[]> }) {
  const [vehId, setVehId] = useState<string | null>(fahrzeuge.length === 1 ? fahrzeuge[0].id : null);
  const [phase, setPhase] = useState<"zaehlen" | "nachfuellen">("zaehlen");
  const [ist, setIst] = useState<Record<string, number>>({});
  const [nachfuell, setNachfuell] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (fahrzeuge.length === 0) return <div className="card cardpad">Keine Fahrzeuge angelegt. Die Verwaltung muss zuerst ein Fahrzeug + Soll pflegen.</div>;

  if (!vehId) return (
    <>
      <div className="screenhead">Fahrzeug wählen</div>
      <div className="card">
        {fahrzeuge.map((f) => (
          <button className="row" key={f.id} onClick={() => setVehId(f.id)} style={{ width: "100%", textAlign: "left", background: "none", border: 0 }}>
            <div className="rowmain"><div className="rowname">{f.name}</div>{f.kennung && <div className="rowmeta"><small>{f.kennung}</small></div>}</div>
          </button>
        ))}
      </div>
    </>
  );

  const veh = fahrzeuge.find((f) => f.id === vehId)!;
  const positionen = soll[vehId] ?? [];
  const faecher = [...new Set(positionen.map((p) => p.fachLabel))];
  // Default = Soll ("voll annehmen, Gezähltes runterkorrigieren"). Der recorded Fahrzeugbestand
  // wird bewusst NICHT als Per-Position-Default genutzt: er ist pro Artikel (nicht pro Fach), und
  // derselbe Artikel in mehreren Fächern würde sich sonst vervielfachen.
  const istWert = (p: Pos) => ist[p.id] ?? p.soll;

  if (msg) return (
    <>
      <div className="card cardpad"><div className="chip chip-ok" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Check size={14} /> {msg}</div></div>
      <button className="btn btn-ghost" onClick={() => { setMsg(null); setPhase("zaehlen"); setIst({}); setNachfuell({}); setVehId(fahrzeuge.length === 1 ? vehId : null); }}>Weiterer Check</button>
    </>
  );

  // ——— Schritt 1: Zählen ———
  if (phase === "zaehlen") {
    const zurNachfuellung = () => {
      // Greedy je Artikel: die Handlager-Verfügbarkeit über die Positionen (Anzeige-Reihenfolge)
      // verteilen, damit der Vorschlag nicht mehr verspricht, als der Handlager hergibt.
      const remaining = new Map<string, number>();
      for (const p of positionen) if (!remaining.has(p.artikelId)) remaining.set(p.artikelId, p.handlagerBestand);
      const nf: Record<string, number> = {};
      for (const p of positionen) {
        const luecke = Math.max(0, p.soll - istWert(p));
        const rem = remaining.get(p.artikelId) ?? 0;
        const nimm = Math.min(luecke, rem);
        nf[p.id] = nimm;
        remaining.set(p.artikelId, rem - nimm);
      }
      setNachfuell(nf);
      setErr(null);
      setPhase("nachfuellen");
    };
    return (
      <>
        <div className="screenhead">{veh.name}{veh.kennung ? ` · ${veh.kennung}` : ""} · Zählen</div>
        {positionen.length === 0 && <div className="card cardpad">Kein Soll für dieses Fahrzeug definiert.</div>}
        {faecher.map((fach) => (
          <div key={fach}>
            <div className="fachhead">{fach}</div>
            <div className="card">
              {positionen.filter((p) => p.fachLabel === fach).map((p) => {
                const wert = istWert(p);
                const luecke = Math.max(0, p.soll - wert);
                const ueber = wert > p.soll;
                return (
                  <div className="row" key={p.id}>
                    <div className={`checkcircle ${luecke > 0 ? "fehl" : "done"}`}>{luecke > 0 ? <AlertTriangle size={14} /> : <Check size={16} />}</div>
                    <div className="rowmain">
                      <div className="rowname">{p.artikelName}</div>
                      <div className="rowmeta">
                        <small>Soll {p.soll} {p.einheit}</small>
                        {luecke > 0 && <span className="chip chip-rot">nachfüllen {luecke}</span>}
                        {ueber && <span className="chip chip-gelb">Überbestand {wert - p.soll}</span>}
                      </div>
                    </div>
                    {/* max großzügig über Soll: echter Überbestand muss zählbar sein, sonst
                        würde der Abgleich real vorhandene Teile still herauskorrigieren. */}
                    <Stepper sm wert={wert} min={0} max={9999} setWert={(vv) => setIst((s) => ({ ...s, [p.id]: vv }))} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {positionen.length > 0 && (
          <div className="summary">
            <div className="info"><b>Ist erfasst?</b><div>Weiter zur Nachfüllung aus dem Handlager</div></div>
            <button className="go" onClick={zurNachfuellung} style={{ display: "flex", alignItems: "center", gap: 6 }}>Weiter <ArrowRight size={16} /></button>
          </div>
        )}
      </>
    );
  }

  // ——— Schritt 2: Nachfüllen aus dem Handlager (bestätigen) ———
  const nfWert = (p: Pos) => nachfuell[p.id] ?? 0;
  // Handlager-Knappheit je Artikel: reicht der Bestand für die Summe aller Nachfüll-Positionen?
  const knappheit = new Map<string, { verfuegbar: number; gewuenscht: number }>();
  for (const p of positionen) {
    const e = knappheit.get(p.artikelId) ?? { verfuegbar: p.handlagerBestand, gewuenscht: 0 };
    e.gewuenscht += nfWert(p);
    knappheit.set(p.artikelId, e);
  }
  const nachfuellPositionen = positionen.filter((p) => Math.max(0, p.soll - istWert(p)) > 0);
  const summeNachfuell = positionen.reduce((s, p) => s + nfWert(p), 0);

  const abschluss = () => {
    setErr(null);
    start(async () => {
      try {
        const { nachgefuellt } = await checkAbschluss({
          fahrzeugId: vehId,
          positionen: positionen.map((p) => ({ sollPositionId: p.id, ist: istWert(p), nachfuellMenge: nfWert(p) })),
        });
        setMsg(`Check abgeschlossen – ${nachgefuellt} Teile aus dem Handlager aufs Fahrzeug gelegt`);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Fehler beim Abschließen – bitte erneut versuchen");
      }
    });
  };

  return (
    <>
      <div className="screenhead">{veh.name} · Nachfüllen</div>
      <button className="btn btn-ghost" onClick={() => setPhase("zaehlen")} style={{ marginBottom: 10 }}>← Zurück zum Zählen</button>
      {nachfuellPositionen.length === 0 ? (
        <div className="card cardpad">Nichts nachzufüllen – alle Positionen sind auf Soll. Du kannst den Check direkt abschließen.</div>
      ) : (
        <div className="card">
          <div className="cardtitle">Aus dem Handlager aufs Fahrzeug legen</div>
          {nachfuellPositionen.map((p) => {
            const luecke = Math.max(0, p.soll - istWert(p));
            return (
              <div className="row" key={p.id}>
                <div className="rowmain">
                  <div className="rowname">{p.artikelName}</div>
                  <div className="rowmeta">
                    <small>Fach {p.handlagerFach} · Lücke {luecke} · Handlager {p.handlagerBestand}</small>
                  </div>
                </div>
                <Stepper sm wert={nfWert(p)} min={0} max={luecke} setWert={(vv) => setNachfuell((s) => ({ ...s, [p.id]: vv }))} />
              </div>
            );
          })}
        </div>
      )}
      {[...knappheit.entries()].filter(([, e]) => e.gewuenscht > e.verfuegbar).length > 0 && (
        <div className="card cardpad">
          <div className="chip chip-gelb" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <AlertTriangle size={13} /> Handlager reicht nicht für alle Positionen – es wird nur gebucht, was verfügbar ist.
          </div>
        </div>
      )}
      {err && <div className="card cardpad"><div className="gateerr">{err}</div></div>}
      <div className="summary">
        <div className="info">
          <b>{summeNachfuell} Teile aufs Fahrzeug</b>
          <div>Bestätigen bucht Handlager → {veh.name}</div>
        </div>
        <button className="go" disabled={pending} onClick={abschluss} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <PackageCheck size={16} /> Gelegt & abschließen
        </button>
      </div>
    </>
  );
}
