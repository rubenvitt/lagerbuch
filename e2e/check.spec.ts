import { test, expect } from "@playwright/test";

const CODE = "222-222"; // eigener Token, siehe e2e/migrate-db.ts (ensureE2eCheckFixtures)

test("Helfer-Check bucht Fehlmenge mit referenz=check und erscheint in der Historie", async ({ page }) => {
  // Token einlösen
  await page.goto("/");
  await page.getByLabel("Zugangs-Code").fill(CODE);
  await page.getByRole("button", { name: "Weiter" }).click();
  await expect(page).toHaveURL(/\/helfer$/);

  // Check-Tab
  await page.getByRole("link", { name: /Fahrzeug-Check/ }).click();
  await expect(page).toHaveURL(/\/helfer\/check$/);

  // Fahrzeug wählen (falls Auswahl nötig)
  const veh = page.getByText("E2E RTW");
  if (await veh.count()) await veh.first().click();

  // Schritt 1 (Zählen): Ist unter Soll setzen (Soll 3 → Ist 2 → Nachfüllbedarf 1), dann Weiter.
  await page.getByRole("button", { name: "Menge verringern" }).first().click();
  await page.getByRole("button", { name: "Weiter" }).click();

  // Schritt 2 (Nachfüllen): Transparenz-Anzeige sichtbar, dann bestätigen.
  await expect(page.getByText(/aus dem Handlager aufs Fahrzeug/i)).toBeVisible();
  await page.getByRole("button", { name: /Gelegt & abschließen/ }).click();
  await expect(page.getByText(/Check abgeschlossen/)).toBeVisible();

  // Admin: Historie zeigt den Check (Demo-Login)
  await page.goto("/");
  await page.getByRole("button", { name: "Demo-Login (nur Entwicklung)" }).click();
  await page.waitForURL("**/verwaltung");
  await page.goto("/verwaltung/checks");
  // Check-Zeile ist ein Link; gezielt darauf prüfen (die Fahrzeug-Filter-Dropdownliste enthält
  // denselben Namen als verstecktes <option>, daher nicht per getByText matchen).
  await expect(page.getByRole("link", { name: /E2E RTW/ })).toBeVisible();
});
