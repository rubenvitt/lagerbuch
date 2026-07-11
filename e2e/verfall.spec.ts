import { test, expect } from "@playwright/test";

// Login-Helfer analog e2e/verwaltung-flow.spec.ts (Demo-Login).
async function login(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo-Login (nur Entwicklung)" }).click();
  await expect(page).toHaveURL(/\/verwaltung/);
}

test("abgelaufene Charge aussondern → Journal-Korrektur, Warnliste leert sich", async ({ page }) => {
  await login(page);
  await page.goto("/verwaltung/verfall");

  // Die abgelaufene Test-Charge ist sichtbar unter „Abgelaufen".
  const zeile = page.locator(".row", { hasText: "E2E Verfall NaCl" });
  await expect(zeile.first()).toBeVisible();

  // Aussondern-Flow
  await page.getByRole("button", { name: /Aussondern/ }).first().click();
  await page.getByPlaceholder(/Grund/).fill("abgelaufen 01/2020");
  await page.getByRole("button", { name: /× aussondern/ }).click();

  // Charge verschwindet aus der Warnliste
  await expect(page.locator(".row", { hasText: "E2E Verfall NaCl" })).toHaveCount(0);

  // Journal zeigt die Korrekturbuchung: die Zeile des Artikels, die den Vorgang
  // „Korrektur" trägt (unterscheidet sie vom geseedeten Zugang), mit Grund und
  // negativem Delta (rest 3 → -3).
  await page.goto("/verwaltung/journal");
  const korrekturZeile = page.locator("tr", { hasText: "E2E Verfall NaCl" }).filter({ hasText: "Korrektur" });
  await expect(korrekturZeile).toBeVisible();
  await expect(korrekturZeile).toContainText("abgelaufen 01/2020");
  await expect(korrekturZeile).toContainText("-3");
});
