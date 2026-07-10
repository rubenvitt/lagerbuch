import { expect, test } from "@playwright/test";

test("dev demo-login reaches the Verwaltung shell", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Demo-Login/ }).click();
  await page.waitForURL("**/verwaltung");
  await expect(page.getByRole("heading", { name: "Übersicht" })).toBeVisible();
  await expect(page.getByText(/Angemeldet als/)).toBeVisible();
});
