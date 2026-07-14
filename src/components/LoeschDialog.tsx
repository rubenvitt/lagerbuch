"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Archive, Trash2, X } from "lucide-react";
import { pruefeLoeschbar, loescheElement, deaktiviereElement } from "@/actions/loeschen";
import type { ElementArt, Loeschbarkeit } from "@/lib/loeschen";

type Props = {
  art: ElementArt;
  id: string;
  /** Exakter Name — muss zur Bestätigung abgetippt werden. */
  name: string;
  /** Anzeige-Bezeichnung der Art, z. B. "Artikel", "Fahrzeug". */
  typLabel: string;
  /** Beschriftung des Deaktivieren-Buttons (Default "Deaktivieren"), z. B. "Sperren" für Codes. */
  deaktivierenLabel?: string;
  onClose: () => void;
  /** Nach erfolgreichem Löschen ODER Deaktivieren aufgerufen (z. B. Redirect/Refresh). */
  onDone: () => void;
};

export function LoeschDialog({ art, id, name, typLabel, deaktivierenLabel = "Deaktivieren", onClose, onDone }: Props) {
  const [status, setStatus] = useState<Loeschbarkeit | undefined>(undefined);
  const [eingabe, setEingabe] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let aktiv = true;
    pruefeLoeschbar(art, id)
      .then((s) => aktiv && setStatus(s))
      .catch((e) => aktiv && setError(e instanceof Error ? e.message : "Prüfung fehlgeschlagen"));
    return () => {
      aktiv = false;
    };
  }, [art, id]);

  // Escape schließt – ohne zu löschen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  useEffect(() => {
    if (status?.loeschbar) inputRef.current?.focus();
  }, [status]);

  const bestaetigt = eingabe.trim() === name.trim();

  async function löschen() {
    if (!bestaetigt || busy) return;
    setBusy(true);
    setError(null);
    try {
      await loescheElement(art, id);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Löschen fehlgeschlagen");
      setBusy(false);
    }
  }

  async function deaktivieren() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await deaktiviereElement(art, id);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deaktivieren fehlgeschlagen");
      setBusy(false);
    }
  }

  return (
    <div className="modaldim" onClick={() => !busy && onClose()}>
      <div className="modalbox" role="dialog" aria-modal="true" aria-label={`${typLabel} löschen`} onClick={(e) => e.stopPropagation()}>
        <div className="modalhead">
          <h2>{typLabel} löschen</h2>
          <button aria-label="Schließen" disabled={busy} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <p className="modalsub">
          <span style={{ fontWeight: 700, color: "var(--tinte)" }}>{name}</span>
        </p>

        {status === undefined && !error && <div className="empty">Prüfe Verknüpfungen …</div>}

        {status?.loeschbar && (
          <>
            <div className="warnbox">
              <AlertTriangle size={15} style={{ flex: "none", marginTop: 1 }} />
              <span>Dieses Element wird endgültig gelöscht. Das kann nicht rückgängig gemacht werden.</span>
            </div>
            <div style={{ marginTop: 14 }}>
              <span className="label">
                Zum Bestätigen den Namen tippen: <span className="mono" style={{ color: "var(--tinte)" }}>{name}</span>
              </span>
              <input
                ref={inputRef}
                className="input"
                value={eingabe}
                disabled={busy}
                onChange={(e) => setEingabe(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void löschen();
                }}
                placeholder="Name exakt eintippen"
                autoComplete="off"
              />
            </div>
            <button className="btn btn-rot" style={{ marginTop: 14 }} disabled={!bestaetigt || busy} onClick={löschen}>
              <Trash2 size={16} /> Endgültig löschen
            </button>
            <button className="btn btn-ghost" style={{ marginTop: 8 }} disabled={busy} onClick={onClose}>
              Abbrechen
            </button>
          </>
        )}

        {status && !status.loeschbar && (
          <>
            <div className="infobox">
              <Archive size={15} style={{ flex: "none", marginTop: 1 }} />
              <span>{status.grund}</span>
            </div>
            {status.kannDeaktivieren ? (
              <>
                <p className="modalnote">
                  Statt zu löschen kannst du das Element deaktivieren: Es verschwindet aus den aktiven Listen, die
                  Historie bleibt aber erhalten.
                </p>
                <button className="btn btn-tinte" style={{ marginTop: 14 }} disabled={busy} onClick={deaktivieren}>
                  <Archive size={16} /> {deaktivierenLabel}
                </button>
              </>
            ) : null}
            <button className="btn btn-ghost" style={{ marginTop: 8 }} disabled={busy} onClick={onClose}>
              Schließen
            </button>
          </>
        )}

        {error && <div style={{ color: "var(--rot)", fontSize: 12.5, fontWeight: 600, marginTop: 12 }}>{error}</div>}
      </div>
    </div>
  );
}
