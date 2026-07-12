import { test, expect } from "@playwright/test";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo-Login (nur Entwicklung)" }).click();
  await expect(page).toHaveURL(/\/verwaltung/);
}

test("Inventur korrigiert einen Artikel auf den gezählten Ist-Wert", async ({ page }) => {
  await login(page);
  await page.goto("/verwaltung/inventur");
  // ersten Artikel um 1 verringern (Ist < Bestand)
  await page.getByRole("button", { name: "Menge verringern" }).first().click();
  await page.getByPlaceholder(/Kommentar/).fill("e2e-Zählung");
  await page.getByRole("button", { name: /Inventur abschließen/ }).click();
  await expect(page.getByText(/Inventur gebucht/)).toBeVisible();
  // Journal zeigt eine Korrektur
  await page.goto("/verwaltung/journal");
  await expect(page.getByText("Korrektur").first()).toBeVisible();
});

test("Bestellung: Artikel als bestellt markieren toggelt den Status", async ({ page }) => {
  await login(page);
  await page.goto("/verwaltung/bestellung");
  const firstToggle = page.getByRole("button", { name: /markieren/ }).first();
  if (await firstToggle.count()) {
    await firstToggle.click();
    await expect(page.getByText("bestellt").first()).toBeVisible();
  }
});
