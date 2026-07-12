import { expect, test } from "@playwright/test";

// M1 happy path against the demo-login dev server (fresh DB per run, see
// playwright.config.ts): login → Artikel → Neuer Artikel → open it → Zugang
// with a new charge → Entnahme → Journal shows the entnahme.
test("verwaltung happy path: create article, zugang, entnahme, journal", async ({ page }) => {
  // Distinct from the names seeded in e2e/migrate-db.ts so this flow-created
  // article is unambiguous (the demo DB is no longer empty — later milestones
  // seed articles for their own specs).
  const artikelName = "E2E Flow Verband";

  await test.step("demo-login reaches the Verwaltung shell", async () => {
    await page.goto("/");
    await page.getByRole("button", { name: /Demo-Login/ }).click();
    await page.waitForURL("**/verwaltung");
    await expect(page.getByRole("heading", { name: "Übersicht" })).toBeVisible();
  });

  await test.step("open the Artikel list", async () => {
    await page.getByRole("link", { name: "Artikel" }).click();
    await expect(page.getByRole("heading", { name: "Artikel & Bestand" })).toBeVisible();
  });

  await test.step("create a new article", async () => {
    await page.getByRole("button", { name: "Neuer Artikel" }).click();
    const drawer = page.locator(".drawer");
    await expect(drawer.getByRole("heading", { name: "Neuer Artikel" })).toBeVisible();
    await drawer.getByPlaceholder("z. B. Beatmungsfilter HME").fill(artikelName);
    // Fach has no <label htmlFor>/aria-label, just a visual span — it's the
    // only <input> (vs. <select>) inside the Einheit/Fach grid2 row.
    await drawer.locator("div.grid2 input").fill("E2E");
    await drawer.getByRole("button", { name: "Artikel anlegen" }).click();
    await expect(drawer).toBeHidden();
    await expect(page.getByRole("cell", { name: artikelName })).toBeVisible();
  });

  await test.step("open the article and book a Zugang with a new charge", async () => {
    await page.locator("tr.click", { hasText: artikelName }).click();
    const drawer = page.locator(".drawer");
    await expect(drawer.getByRole("heading", { name: artikelName })).toBeVisible();

    // Charge selector already defaults to "+ Neue Charge".
    await drawer.getByPlaceholder("z. B. 2507-014").fill("E2E-001");
    await drawer.locator('input[type="month"]').fill("2030-01");
    await drawer.getByRole("button", { name: "Zugang" }).click();

    // Not `.first()`: buchungen.ts is stored at second resolution (drizzle's
    // timestamp mode), so a Zugang and Entnahme booked within the same test
    // (same second) can tie on `ORDER BY ts DESC` — match by content instead.
    await expect(drawer.locator(".card.journal .row", { hasText: "Wareneingang" })).toBeVisible();
  });

  await test.step("book an Entnahme", async () => {
    const drawer = page.locator(".drawer");
    await drawer.getByRole("button", { name: "Entnahme" }).click();
    await expect(drawer.locator(".card.journal .row", { hasText: "Entnahme" })).toBeVisible();
  });

  await test.step("Journal shows the entnahme with a negative delta", async () => {
    await page.locator(".drawer").getByRole("button", { name: "Schließen" }).click();
    await page.getByRole("link", { name: "Journal" }).click();
    await expect(page.getByRole("heading", { name: "Journal" })).toBeVisible();

    const entnahmeRow = page.locator("table.tbl tbody tr", { hasText: artikelName }).filter({ hasText: "Entnahme" });
    await expect(entnahmeRow).toHaveCount(1);
    await expect(entnahmeRow.locator(".jdelta.minus")).toHaveText("-1");
  });
});
