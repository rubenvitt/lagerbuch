import { test, expect } from "@playwright/test";

const CODE = "111-111"; // muss zum Seed in e2e/migrate-db.ts passen

test("Code einlösen → /helfer → Entnahme → Journal zeigt quelleTyp=token", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Zugangs-Code").fill(CODE);
  await page.getByRole("button", { name: "Weiter" }).click();
  await expect(page).toHaveURL(/\/helfer$/);

  // ersten Artikel öffnen
  await page.locator("a.row").first().click();
  await expect(page).toHaveURL(/\/a\//);
  await page.getByRole("button", { name: /Entnahme buchen/ }).click();
  await expect(page.getByText(/Entnahme gebucht/)).toBeVisible();

  // Spec §7: Journal muss die Token-Provenienz zeigen. Das Journal löst die
  // quelleId zum Anzeigenamen auf; für eine Token-Entnahme ist das das
  // Token-Label (Seed: "E2E") — genau dieses Label (statt eines User-Namens)
  // belegt quelleTyp=token als Quelle der Buchung; der rohe Code steht im title.
  await page.goto("/");
  await page.getByRole("button", { name: /Demo-Login/ }).click();
  await page.waitForURL("**/verwaltung");
  await page.getByRole("link", { name: "Journal" }).click();
  await expect(page.getByRole("heading", { name: "Journal" })).toBeVisible();
  const entnahmeRow = page.locator("table.tbl tbody tr", { hasText: "Entnahme" });
  await expect(entnahmeRow.getByText("E2E", { exact: true })).toBeVisible();
  await expect(entnahmeRow.locator(`[title="${CODE}"]`)).toBeVisible();
});

test("gesperrter Token wird an der Buchung abgewiesen", async ({ page }) => {
  // Spec §7: Token sperren → nächste Entnahme bounced (sofortige Sperrwirkung).
  // 1. Als Helfer einlösen, solange der Token noch aktiv ist (Cookie gesetzt).
  await page.goto("/");
  await page.getByLabel("Zugangs-Code").fill(CODE);
  await page.getByRole("button", { name: "Weiter" }).click();
  await expect(page).toHaveURL(/\/helfer$/);

  // 2. Als Admin denselben Token sperren.
  await page.goto("/");
  await page.getByRole("button", { name: /Demo-Login/ }).click();
  await page.waitForURL("**/verwaltung");
  await page.getByRole("link", { name: "Zugangs-Codes" }).click();
  const tokenRow = page.locator(".row", { hasText: CODE });
  await tokenRow.getByRole("button", { name: "Sperren" }).click();
  await expect(tokenRow.getByText("gesperrt")).toBeVisible();

  // 3. Als Helfer (jose-Cookie noch signatur-gültig) eine Entnahme versuchen.
  //    requireHelfer macht den DB-Recheck tokens.aktiv → die Buchung wirft
  //    ("Token gesperrt"). Ohne eigene Error-Boundary schlägt der Server-Action-
  //    Fehler bis zur Fehlerseite durch; der Erfolgs-Toast erscheint nie.
  await page.goto("/a/e2e-artikel");
  await expect(page.getByRole("button", { name: /Entnahme buchen/ })).toBeVisible();
  await page.getByRole("button", { name: /Entnahme buchen/ }).click();
  // Deterministisches Bounce-Signal (auto-wartet auf die verworfene Buchung):
  await expect(page.getByText(/server-side exception/)).toBeVisible();
  await expect(page.getByText(/Entnahme gebucht/)).toHaveCount(0);
});
