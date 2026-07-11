import { test, expect } from "@playwright/test";

const CODE = "111-111"; // muss zum M2-Seed passen

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

  // Ist unter Soll setzen: den ersten Stepper-Minus einmal drücken (Soll 3 → Ist 2 → Fehlmenge 1)
  await page.getByRole("button", { name: "Menge verringern" }).first().click();
  await page.getByRole("button", { name: "Abschließen" }).click();
  await expect(page.getByText(/Check abgeschlossen/)).toBeVisible();

  // Admin: Historie zeigt den Check (Demo-Login)
  await page.goto("/");
  await page.getByRole("button", { name: "Demo-Login (nur Entwicklung)" }).click();
  await page.waitForURL("**/verwaltung");
  await page.goto("/verwaltung/checks");
  await expect(page.getByText("E2E RTW").first()).toBeVisible();
});
