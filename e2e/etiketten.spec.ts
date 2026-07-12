import { test, expect } from "@playwright/test";

test("Etiketten-Seite rendert QR-Etiketten für geseedete Artikel/Token", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo-Login (nur Entwicklung)" }).click();
  await expect(page).toHaveURL(/\/verwaltung/);

  await page.goto("/verwaltung/etiketten");
  await expect(page.getByRole("heading", { name: "Etiketten" })).toBeVisible();

  const qr = page.locator(".etikett img").first();
  await expect(qr).toBeVisible();
  await expect(qr).toHaveAttribute("src", /^data:image\/png/);

  // Drucken-Button vorhanden
  await expect(page.getByRole("button", { name: /Drucken/ })).toBeVisible();
});
