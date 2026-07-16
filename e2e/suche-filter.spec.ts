import { test, expect } from "@playwright/test";

// Nutzt die Handlager-Fixtures aus e2e/migrate-db.ts: "E2E Verbandpäckchen" (mit Zugangsbuchung)
// und "E2E Verfall NaCl". Beide sind initial in Artikel- und Journal-Liste sichtbar.

test("Artikel-Suche filtert die Liste client-seitig", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Demo-Login/ }).click();
  await page.waitForURL("**/verwaltung");

  await page.goto("/verwaltung/artikel");
  await expect(page.getByRole("cell", { name: "E2E Verbandpäckchen" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "E2E Verfall NaCl" })).toBeVisible();

  await page.getByRole("searchbox", { name: /Artikel oder Fach suchen/ }).fill("Verbandpäckchen");
  await expect(page.getByRole("cell", { name: "E2E Verbandpäckchen" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "E2E Verfall NaCl" })).toHaveCount(0);
});

test("Journal-Suche grenzt server-seitig über URL-State ein", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Demo-Login/ }).click();
  await page.waitForURL("**/verwaltung");

  await page.goto("/verwaltung/journal");
  await expect(page.getByRole("cell", { name: "E2E Verbandpäckchen" }).first()).toBeVisible();

  await page.getByRole("searchbox", { name: /Artikel oder Kommentar suchen/ }).fill("Verbandpäckchen");
  // Debounced → URL bekommt den q-Parameter, Server rendert gefiltert neu.
  await expect(page).toHaveURL(/[?&]q=Verband/);
  await expect(page.getByRole("cell", { name: "E2E Verbandpäckchen" }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "E2E Verfall NaCl" })).toHaveCount(0);
});
