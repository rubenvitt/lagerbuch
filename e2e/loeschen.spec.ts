import { expect, test } from "@playwright/test";

// Sicheres Löschen (safe-element-deletion): Ein Artikel ohne Historie lässt sich per
// Tippbestätigung endgültig löschen; ein Artikel MIT Historie ist gegen Löschen gesperrt und
// bietet stattdessen Deaktivieren an.
test("sicheres Löschen: Tippbestätigung löscht, Historie sperrt und bietet Deaktivieren", async ({ page }) => {
  const frei = "E2E Löschbar Frei";
  const mitHistorie = "E2E Löschbar Historie";

  await test.step("Demo-Login → Artikel-Liste", async () => {
    await page.goto("/");
    await page.getByRole("button", { name: /Demo-Login/ }).click();
    await page.waitForURL("**/verwaltung");
    await page.getByRole("link", { name: "Artikel" }).click();
    await expect(page.getByRole("heading", { name: "Artikel & Bestand" })).toBeVisible();
  });

  await test.step("zwei Artikel anlegen", async () => {
    for (const name of [frei, mitHistorie]) {
      await page.getByRole("button", { name: "Neuer Artikel" }).click();
      const drawer = page.locator(".drawer");
      await drawer.getByPlaceholder("z. B. Beatmungsfilter HME").fill(name);
      await drawer.locator("div.grid2 input").fill("E2E");
      await drawer.getByRole("button", { name: "Artikel anlegen" }).click();
      await expect(drawer).toBeHidden();
      await expect(page.getByRole("cell", { name })).toBeVisible();
    }
  });

  await test.step("dem zweiten Artikel Historie (Zugang) geben", async () => {
    await page.locator("tr.click", { hasText: mitHistorie }).click();
    const drawer = page.locator(".drawer");
    await drawer.getByPlaceholder("z. B. 2507-014").fill("E2E-HIST");
    await drawer.locator('input[type="month"]').fill("2030-01");
    await drawer.getByRole("button", { name: "Zugang" }).click();
    await expect(drawer.locator(".card.journal .row", { hasText: "Wareneingang" })).toBeVisible();
    await drawer.getByRole("button", { name: "Schließen" }).click();
  });

  await test.step("Artikel OHNE Historie: löschen erfordert exakten Namen", async () => {
    await page.locator("tr.click", { hasText: frei }).click();
    const drawer = page.locator(".drawer");
    await drawer.getByRole("button", { name: "Artikel löschen" }).click();

    const modal = page.locator(".modalbox");
    await expect(modal.getByRole("heading", { name: "Artikel löschen" })).toBeVisible();
    const loeschen = modal.getByRole("button", { name: "Endgültig löschen" });
    // Ohne korrekten Namen ist der Button gesperrt (kein versehentliches Löschen).
    await expect(loeschen).toBeDisabled();
    await modal.getByPlaceholder("Name exakt eintippen").fill("falsch");
    await expect(loeschen).toBeDisabled();
    await modal.getByPlaceholder("Name exakt eintippen").fill(frei);
    await expect(loeschen).toBeEnabled();
    await loeschen.click();

    // Drawer + Modal schließen, Zeile ist weg.
    await expect(page.getByRole("cell", { name: frei, exact: true })).toHaveCount(0);
  });

  await test.step("Artikel MIT Historie: löschen gesperrt, Deaktivieren angeboten", async () => {
    await page.locator("tr.click", { hasText: mitHistorie }).click();
    const drawer = page.locator(".drawer");
    await drawer.getByRole("button", { name: "Artikel löschen" }).click();

    const modal = page.locator(".modalbox");
    await expect(modal.getByText(/Nachweis zerstören/)).toBeVisible();
    // Kein Tippfeld/Löschen-Button, dafür Deaktivieren.
    await expect(modal.getByPlaceholder("Name exakt eintippen")).toHaveCount(0);
    await modal.getByRole("button", { name: "Deaktivieren" }).click();

    // Zeile bleibt erhalten, jetzt als inaktiv markiert.
    const row = page.locator("tr.click", { hasText: mitHistorie });
    await expect(row.getByText("inaktiv")).toBeVisible();
  });
});
