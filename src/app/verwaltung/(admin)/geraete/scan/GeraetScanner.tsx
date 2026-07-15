"use client";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { geraetZuBarcode } from "@/actions/geraete";

export function GeraetScanner() {
  return (
    <BarcodeScanner
      zuBarcode={geraetZuBarcode}
      zielUrl={(id) => `/verwaltung/geraete/${id}`}
      nichtGefunden={(code) => `Kein Gerät mit Barcode „${code}“ – ggf. erst unter Geräte anlegen.`}
    />
  );
}
