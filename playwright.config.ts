import { defineConfig } from "@playwright/test";

const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: externalBaseURL ?? "http://localhost:3000" },
  // When PLAYWRIGHT_BASE_URL is set (CI against a running container) we do NOT
  // start a dev server; otherwise start the Next dev server locally.
  webServer: externalBaseURL
    ? undefined
    : {
        command: "pnpm dev",
        url: "http://localhost:3000/api/health",
        env: {
          APP_ORG: "DRK Bereitschaft Musterstadt",
          AUTH_DEV_LOGIN: "true",
          AUTH_SECRET: "test-secret",
          NODE_ENV: "development",
        },
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
