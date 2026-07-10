import { expect, test } from "@playwright/test";

test("gate renders brand, tagline, org and the two entry cards", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("LAGERBUCH", { exact: true })).toBeVisible();
  await expect(page.getByText("Materialverwaltung")).toBeVisible();
  await expect(
    page.getByText("DRK Bereitschaft Musterstadt"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Im Dienst" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Verwaltung" }),
  ).toBeVisible();
});
