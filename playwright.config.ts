import { defineConfig } from "@playwright/test";

const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  // All specs share one dev server + one SQLite file, so they must not run
  // concurrently against it.
  workers: 1,
  use: { baseURL: externalBaseURL ?? "http://localhost:3000" },
  // When PLAYWRIGHT_BASE_URL is set (CI against a running container) we do NOT
  // start a dev server; otherwise start the Next dev server locally.
  webServer: externalBaseURL
    ? undefined
    : {
        // Three steps, guaranteed sequential (webServer.command is one shell
        // chain, unlike a separate Playwright globalSetup — see below):
        //   1. delete the throwaway e2e DB so every run starts empty.
        //   2. migrate + seed it via a standalone `tsx` process.
        //   3. only then start `next dev`.
        // Step 2 can't be left to src/instrumentation.ts (which does the same
        // two calls and normally suffices — see e2e/migrate-db.ts for why
        // `next dev` specifically needs the file pre-migrated) or to a
        // Playwright globalSetup file (undocumented whether that runs before
        // or after webServer.command is spawned; the well-known
        // "authenticate once" pattern has globalSetup hit an already-running
        // server, so it can't be assumed to win the race against `next dev`
        // opening the DB file).
        command:
          "rm -f ./.data/e2e.db ./.data/e2e.db-wal ./.data/e2e.db-shm && pnpm exec tsx e2e/migrate-db.ts && pnpm dev",
        url: "http://localhost:3000/api/health",
        env: {
          APP_ORG: "DRK Bereitschaft Musterstadt",
          AUTH_DEV_LOGIN: "true",
          AUTH_SECRET: "test-secret",
          NODE_ENV: "development",
          // Process env wins over .env.development's DATABASE_PATH=./.data/dev.db —
          // e2e runs must never touch (or wipe) the developer's own dev DB.
          DATABASE_PATH: "./.data/e2e.db",
        },
        // Always spawn a fresh server: reusing a developer's already-running `pnpm dev`
        // would point e2e at ./.data/dev.db instead of the throwaway ./.data/e2e.db,
        // writing test data into (and reading stale state from) their live dev DB.
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
