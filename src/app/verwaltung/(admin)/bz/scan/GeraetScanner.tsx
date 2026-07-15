"use client";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { geraetZuBarcode } from "@/actions/bz";

export function GeraetScanner() {
  return (
    <BarcodeScanner
      zuBarcode={geraetZuBarcode}
      zielUrl={(id) => `/verwaltung/bz/${id}/kontrolle`}
      nichtGefunden={(code) => `Kein Gerät mit Barcode „${code}“ – ggf. erst unter BZ-Kontrolle anlegen.`}
    />
  );
}
