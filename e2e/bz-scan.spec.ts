import { test, expect } from "@playwright/test";

// Scanner-Flow ohne Kamera (headless): der Kamera-Start schlägt fehl, die
// manuelle Barcode-Eingabe muss als Fallback zum Kontroll-Flow führen.
// Zusätzlich: das Logbuch zeigt den aufgelösten Klarnamen statt der User-ID.
test("BZ: Gerät per Barcode finden → Kontrolle erfassen → Logbuch zeigt Klarnamen", async ({ page }) => {
  // Der Flow quert mehrere frisch zu kompilierende Routen + Server-Action-Roundtrips;
  // im Dev-Server (e2e-Setup) reißt das die 30s-Default-Testzeit gelegentlich.
  test.setTimeout(120_000);
  const barcode = `SN-${Date.now()}`;

  await page.goto("/");
  await page.getByRole("button", { name: /Demo-Login/ }).click();
  await page.waitForURL("**/verwaltung");

  // Gerät mit Barcode anlegen
  await page.getByRole("link", { name: "BZ-Kontrolle" }).click();
  await page.getByRole("button", { name: "Neues Gerät" }).click();
  await page.getByPlaceholder("z. B. Accu-Chek").fill("Scan-Testgerät");
  await page.getByPlaceholder("Barcode / Seriennummer").fill(barcode);
  await page.getByRole("button", { name: "Gerät anlegen" }).click();
  await expect(page.getByRole("link", { name: /Scan-Testgerät/ })).toBeVisible();

  // Scanner: manuelle Eingabe (Kamera gibt es headless nicht).
  // Großzügige Timeouts: der Dev-Server kompiliert Scan- und Kontroll-Route
  // beim ersten Aufruf (inkl. zxing-Chunk), das dauert länger als die 5s-Defaults.
  await page.getByRole("link", { name: "Scannen" }).click();
  await expect(page.getByRole("heading", { name: "Gerät scannen" })).toBeVisible({ timeout: 20_000 });
  await page.getByPlaceholder("Seriennummer / Barcode").fill(barcode);
  await page.getByRole("button", { name: "Suchen" }).click();

  // Kontroll-Flow: Gerät + Barcode im Kopf, Erfassen funktioniert
  await expect(page).toHaveURL(/\/verwaltung\/bz\/.+\/kontrolle$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: /Scan-Testgerät/ })).toBeVisible();
  // Nach der vollen Navigation vom Scanner landen Eingaben/Klicks sonst vor der
  // React-Hydration und verpuffen (React setzt vor-hydration gefüllte kontrollierte
  // Inputs auf seinen State zurück). Daher: warten bis alle Chunks geladen sind und
  // im Retry prüfen, dass der Wert die Hydration überlebt hat, bevor geklickt wird.
  await page.waitForLoadState("networkidle");
  const kommentar = page.getByPlaceholder("Kommentar (optional)");
  await expect(async () => {
    await kommentar.fill("per Scan");
    await page.waitForTimeout(300);
    await expect(kommentar).toHaveValue("per Scan");
    await page.getByRole("button", { name: "Kontrolle erfassen" }).click();
    await expect(page.getByText(/Kontrolle erfasst/)).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });

  // unbekannter Barcode → klare Meldung statt Navigation
  await page.getByRole("link", { name: "Nächstes Gerät scannen" }).click();
  await page.getByPlaceholder("Seriennummer / Barcode").fill("gibt-es-nicht");
  await page.getByRole("button", { name: "Suchen" }).click();
  await expect(page.getByText(/Kein Gerät mit Barcode/)).toBeVisible({ timeout: 20_000 });

  // Logbuch auf der Detailseite: Klarname des Demo-Admins statt "dev-admin"
  await page.goto("/verwaltung/bz");
  await page.getByRole("link", { name: /Scan-Testgerät/ }).click();
  // .first(): der Hydration-Retry oben kann die Kontrolle doppelt erfasst haben
  await expect(page.getByText(/Demo-Verwaltung/).first()).toBeVisible();
  await expect(page.getByText("per Scan").first()).toBeVisible();
});
