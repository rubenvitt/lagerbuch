"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { importArtikelCsv } from "@/actions/csv";
import { HEADER } from "@/lib/csv";

const BEISPIEL = `${HEADER}\nVerbandpäckchen K,Pkg.,B2,10,25\nEinmalhandschuhe M,Box,B4,5,0`;

export function ImportForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ angelegt: number; fehler: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onImport() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await importArtikelCsv(text);
      setResult(res);
      if (res.angelegt > 0) setText("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card">
        <div className="cardtitle">Erwartetes Format</div>
        <div className="cardpad" style={{ display: "grid", gap: 8 }}>
          <p style={{ margin: 0 }}>Kopfzeile (wird automatisch erkannt und übersprungen, ist aber optional):</p>
          <span className="mono" style={{ fontSize: 12.5, fontWeight: 600 }}>
            {HEADER}
          </span>
          <p className="footnote" style={{ margin: 0 }}>
            Trennzeichen Komma oder Semikolon · startbestand &gt; 0 wird als Korrektur-Buchung „CSV-Startbestand“ im
            Journal erfasst.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="cardtitle">CSV einfügen</div>
        <div className="cardpad" style={{ display: "grid", gap: 12 }}>
          <textarea
            className="input"
            rows={10}
            style={{ fontFamily: "var(--mono)", fontSize: 12.5, resize: "vertical" }}
            placeholder={BEISPIEL}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="CSV-Daten"
          />
          {error && <div style={{ color: "var(--rot)", fontSize: 12.5, fontWeight: 600 }}>{error}</div>}
          <button className="btn btn-rot" disabled={!text.trim() || busy} onClick={onImport}>
            <Upload size={16} /> Importieren
          </button>
        </div>
      </div>

      {result && (
        <div className="card">
          <div className="cardtitle">Ergebnis</div>
          <div className="cardpad" style={{ display: "grid", gap: 8 }}>
            <p style={{ margin: 0 }}>
              <strong>{result.angelegt}</strong> Artikel angelegt.
            </p>
            {result.fehler.length === 0 ? (
              <p className="footnote" style={{ margin: 0 }}>
                Keine Fehler.
              </p>
            ) : (
              <>
                <p style={{ margin: 0, color: "var(--rot)", fontWeight: 600 }}>{result.fehler.length} Fehler:</p>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {result.fehler.map((f, i) => (
                    <li key={i} className="mono" style={{ fontSize: 12 }}>
                      {f}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
