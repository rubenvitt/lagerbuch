"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Flashlight, Search } from "lucide-react";
import type { IScannerControls } from "@zxing/browser";
import { geraetZuBarcode } from "@/actions/bz";

/**
 * Kamera-Scanner für die Seriennummern-Barcodes auf den BZ-Geräten.
 * Decodiert per @zxing/browser (läuft auch auf iOS-Safari, wo es kein natives
 * BarcodeDetector-API gibt) und springt bei Treffer direkt in den Kontroll-Flow.
 * Ohne Kamera(-Freigabe) bleibt die manuelle Eingabe als Fallback.
 */
export function GeraetScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  // Verhindert parallele Lookups: zxing feuert denselben Code viele Male pro Sekunde.
  const busyRef = useRef(false);
  const [kameraFehler, setKameraFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [sucht, setSucht] = useState(false);
  const [torch, setTorch] = useState(false);
  const [manuell, setManuell] = useState("");

  const pruefeCode = useCallback(
    async (code: string) => {
      if (busyRef.current || !code.trim()) return;
      busyRef.current = true;
      setSucht(true);
      setMeldung(null);
      try {
        const treffer = await geraetZuBarcode(code);
        if (treffer) {
          controlsRef.current?.stop();
          // Volle Navigation statt router.push: die Soft-Navigation direkt nach einer
          // Server-Action wird (v. a. im Dev-Modus) gern abgebrochen, und nach einem
          // Scan ist ein frischer Seitenaufbau ohnehin gewollt.
          window.location.assign(`/verwaltung/bz/${treffer.id}/kontrolle`);
          return; // busy bleibt gesetzt, sonst navigiert ein Folge-Scan doppelt
        }
        setMeldung(`Kein Gerät mit Barcode „${code.trim()}“ – ggf. erst unter BZ-Kontrolle anlegen.`);
      } catch {
        setMeldung("Suche fehlgeschlagen – bitte erneut versuchen.");
      } finally {
        setSucht(false);
      }
      // Kurze Sperre, damit derselbe (unbekannte) Code nicht im Dauerfeuer nervt.
      setTimeout(() => {
        busyRef.current = false;
      }, 2000);
    },
    [],
  );

  useEffect(() => {
    let beendet = false;
    (async () => {
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.ITF,
          BarcodeFormat.QR_CODE,
          BarcodeFormat.DATA_MATRIX,
        ]);
        const reader = new BrowserMultiFormatReader(hints);
        if (beendet || !videoRef.current) return;
        controlsRef.current = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          videoRef.current,
          (result) => {
            if (result) void pruefeCode(result.getText());
          },
        );
        if (beendet) controlsRef.current?.stop();
      } catch {
        if (!beendet) setKameraFehler("Kamera nicht verfügbar oder Zugriff abgelehnt – Barcode unten eintippen.");
      }
    })();
    return () => {
      beendet = true;
      controlsRef.current?.stop();
    };
  }, [pruefeCode]);

  function torchToggle() {
    const c = controlsRef.current;
    if (!c?.switchTorch) return;
    const an = !torch;
    void c.switchTorch(an);
    setTorch(an);
  }

  return (
    <>
      {kameraFehler ? (
        <div className="card cardpad">{kameraFehler}</div>
      ) : (
        <div className="card" style={{ position: "relative", overflow: "hidden", background: "#000" }}>
          <video
            ref={videoRef}
            muted
            playsInline
            style={{ display: "block", width: "100%", maxHeight: "58vh", objectFit: "cover" }}
          />
          <div className="scanline" />
          <button
            className="btn-icon"
            aria-label="Taschenlampe"
            onClick={torchToggle}
            style={{
              position: "absolute",
              right: 10,
              bottom: 10,
              background: torch ? "var(--rot)" : "rgba(255,255,255,.9)",
              color: torch ? "#fff" : "var(--tinte)",
              borderColor: "transparent",
            }}
          >
            <Flashlight size={17} />
          </button>
        </div>
      )}

      {meldung && <div className="card cardpad gateerr">{meldung}</div>}

      <div className="card cardpad">
        <span className="label">Barcode manuell</span>
        <form
          className="addrow"
          style={{ display: "flex", gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            busyRef.current = false;
            void pruefeCode(manuell);
          }}
        >
          <input
            className="input"
            placeholder="Seriennummer / Barcode"
            value={manuell}
            onChange={(e) => setManuell(e.target.value)}
            autoComplete="off"
          />
          <button className="btn btn-tinte" type="submit" disabled={sucht || manuell.trim() === ""}>
            <Search size={15} /> Suchen
          </button>
        </form>
      </div>
    </>
  );
}
