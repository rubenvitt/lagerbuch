"use client";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { aussondern } from "@/actions/aussondern";
import { VerfallItem, type VerfallEintragView } from "./VerfallItem";

export function AussondernRow({ eintrag }: { eintrag: VerfallEintragView }) {
  const [open, setOpen] = useState(false);
  const [kommentar, setKommentar] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    if (!kommentar.trim()) { setErr("Kommentar erforderlich"); return; }
    start(async () => {
      try {
        await aussondern({ chargeId: eintrag.chargeId, kommentar: kommentar.trim() });
        // revalidatePath aktualisiert die Liste → die Zeile verschwindet beim Re-Render.
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Fehler beim Aussondern");
      }
    });
  }

  // Fragment statt Wrapper-<div>: so bleibt der .row ein direktes Kind der .card,
  // damit der .row:first-child-Trenner in globals.css korrekt greift.
  return (
    <>
      <VerfallItem
        eintrag={eintrag}
        action={!open ? (
          <button className="btn btn-rot slim" style={{ flex: "none" }} onClick={() => setOpen(true)}>
            <Trash2 size={15} /> Aussondern
          </button>
        ) : undefined}
      />
      {open && (
        <div className="cardpad" style={{ display: "grid", gap: 8 }}>
          <input className="input" placeholder="Grund (Pflicht), z. B. abgelaufen 01/2020" value={kommentar}
            autoFocus onChange={(e) => { setKommentar(e.target.value); setErr(null); }} />
          {err && <div className="gateerr">{err}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-rot slim" disabled={pending || !kommentar.trim()} onClick={submit}>
              {eintrag.rest}× aussondern
            </button>
            <button className="btn btn-ghost slim" onClick={() => { setOpen(false); setErr(null); }}>Abbrechen</button>
          </div>
        </div>
      )}
    </>
  );
}
