import { test, expect } from "@playwright/test";

const CHECK_CODE = "333-333"; // eigener Token + Fahrzeug, siehe e2e/migrate-db.ts (ensureE2eGeraeteFixtures)

test("Geräte: anlegen + Barcode-Scan findet das Gerät", async ({ page }) => {
  // Quert mehrere frisch zu kompilierende Routen (inkl. zxing-Chunk) im Dev-Server.
  test.setTimeout(120_000);
  const barcode = `GER-${Date.now()}`;

  await page.goto("/");
  await page.getByRole("button", { name: /Demo-Login/ }).click();
  await page.waitForURL("**/verwaltung");

  // Medizinisches Gerät mit Barcode anlegen
  await page.getByRole("link", { name: "Geräte", exact: true }).click();
  await expect(page).toHaveURL(/\/verwaltung\/geraete$/, { timeout: 20_000 });
  await page.getByRole("button", { name: "Neues Gerät" }).click();
  await page.getByPlaceholder("z. B. Corpuls C3").fill("E2E Corpuls");
  await page.getByPlaceholder("Barcode / Seriennummer").fill(barcode);
  // Bewusst ins Handlager legen (nicht auf ein Check-Fahrzeug), sonst taucht das Gerät im
  // Geräte-Schritt des zweiten Tests auf und verfälscht dessen Selektoren.
  // Standort ist eine suchbare Combobox: öffnen und den Eintrag „Handlager“ wählen.
  await page.getByRole("combobox", { name: "Standort" }).click();
  await page.getByRole("option", { name: "Handlager", exact: true }).click();
  await page.getByRole("button", { name: "Gerät anlegen" }).click();
  await expect(page.getByRole("link", { name: /E2E Corpuls/ })).toBeVisible({ timeout: 20_000 });

  // Scanner: manuelle Eingabe (Kamera gibt es headless nicht) → springt aufs Geräte-Detail.
  await page.getByRole("link", { name: "Scannen" }).click();
  await expect(page.getByRole("heading", { name: "Gerät scannen" })).toBeVisible({ timeout: 20_000 });
  await page.getByPlaceholder("Seriennummer / Barcode").fill(barcode);
  await page.getByRole("button", { name: "Suchen" }).click();
  await expect(page.getByRole("heading", { name: "E2E Corpuls" })).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/verwaltung\/geraete\/(?!scan$)[^/]+$/);

  // unbekannter Barcode → klare Meldung statt Navigation (Scan-Seite direkt öffnen,
  // das Geräte-Detail hat keinen „Scannen"-Link).
  await page.goto("/verwaltung/geraete/scan");
  await expect(page.getByRole("heading", { name: "Gerät scannen" })).toBeVisible({ timeout: 20_000 });
  await page.getByPlaceholder("Seriennummer / Barcode").fill("gibt-es-nicht");
  await page.getByRole("button", { name: "Suchen" }).click();
  await expect(page.getByText(/Kein Gerät mit Barcode/)).toBeVisible({ timeout: 20_000 });
});

test("Fahrzeugcheck: Geräte-Schritt quittiert Defekt → Auswertung zeigt auffällig", async ({ page }) => {
  test.setTimeout(120_000);

  // Token einlösen → Helfer
  await page.goto("/");
  await page.getByLabel("Zugangs-Code").fill(CHECK_CODE);
  await page.getByRole("button", { name: "Weiter" }).click();
  await expect(page).toHaveURL(/\/helfer$/);

  // Check-Tab → Fahrzeug wählen (es gibt mehrere aktive Fahrzeuge)
  await page.getByRole("link", { name: /Fahrzeug-Check/ }).click();
  await expect(page).toHaveURL(/\/helfer\/check$/);
  await page.getByRole("button", { name: /E2E Geräte RTW/ }).click();

  // Schritt „Zählen" (Ist = Soll voreingestellt) → weiter
  await page.getByRole("button", { name: "Weiter" }).click();
  // Schritt „Nachfüllen" (nichts nachzufüllen) → weiter zur Geräte-Prüfung
  await page.getByRole("button", { name: "Weiter" }).click();

  // Schritt „Geräte": das Objekt als Defekt quittieren, dann abschließen
  await expect(page.getByText("E2E Spineboard")).toBeVisible();
  await page.getByRole("button", { name: "Defekt" }).click();
  await page.getByRole("button", { name: "Abschließen" }).click();
  await expect(page.getByText(/Check abgeschlossen/)).toBeVisible();
  await expect(page.getByText(/1 Gerät\(e\) auffällig/)).toBeVisible();

  // Admin: Übersicht zeigt den auffälligen Check, Detail zeigt Gerät + Zustand
  await page.goto("/");
  await page.getByRole("button", { name: /Demo-Login/ }).click();
  await page.waitForURL("**/verwaltung");
  await page.goto("/verwaltung/checks");
  await expect(page.getByText(/1 Gerät\(e\) auffällig/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("link", { name: /E2E Geräte RTW/ }).first().click();
  // Check-Detail: Geräte-Sektion listet das Gerät mit quittiertem Zustand
  await expect(page.getByText("E2E Spineboard")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Defekt")).toBeVisible();
});
