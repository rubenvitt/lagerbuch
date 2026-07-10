# Lagerbuch M0 — Walking Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployable Next.js 15 skeleton with config-driven branding, a health endpoint, the rendered Gate page, and a full CI/CD pipeline that publishes a multi-arch image to GHCR.

**Architecture:** Single Next.js App-Router container (`output: "standalone"`). All branding/behavior comes from a zod-parsed env config module (`src/lib/config.ts`) — no hardcoded organization strings. The UI design system (colors, fonts, component classes) is ported wholesale from `mockup.jsx` into Tailwind 4 `@theme` tokens + a global stylesheet, so later component ports are pure JSX. CI builds `linux/amd64 + linux/arm64` via buildx/QEMU on GitHub-hosted runners.

**Tech Stack:** Next.js 15 (App Router, React 19, TypeScript) · Tailwind CSS 4 · `next/font/google` (self-hosted at build) · zod · lucide-react · Vitest · Playwright · pnpm + mise · Docker (`node:24-slim`) · GitHub Actions → GHCR.

## Global Constraints

- **Runtime:** Node 24 LTS. Toolchain pinned via `mise.toml` (Node 24 + pnpm). Package manager: **pnpm** only.
- **Framework:** Next.js 15 App Router, React 19, TypeScript strict, `output: "standalone"`, source under `src/`, import alias `@/* → ./src/*`.
- **Styling:** Tailwind CSS 4 with design tokens declared in `@theme`. Exact palette (verbatim from `mockup.jsx`): `--rot #C8000F`, `--rot-dk #A2000C`, `--rot-bg #FBE9EB`, `--tinte #1A1D20`, `--stahl #5B6570`, `--linie #D9DDE1`, `--papier #EEF0F1`, `--karte #FFFFFF`, `--gelb #B26A00`, `--gelb-bg #FBF1DC`, `--ok #1E7A3C`, `--ok-bg #E4F2E9`. Fonts **self-hosted via `next/font/google`** (Barlow, Barlow Condensed, IBM Plex Mono) — no runtime CDN.
- **Config:** every user-facing string/number comes from `src/lib/config.ts`, parsed from `process.env` via zod. Invalid config throws at startup. Defaults: `APP_NAME=Lagerbuch`, `APP_ORG=""`, `APP_TAGLINE=Materialverwaltung`, `APP_BASE_URL=http://localhost:3000` (dev default; prod sets explicitly), `DATABASE_PATH=/data/lagerbuch.db`, `TZ=Europe/Berlin`, `WARN_TAGE_KRITISCH=31`, `WARN_TAGE_FAELLIG=56`, `BESTELL_FAKTOR=2`, `HELFER_SESSION_STUNDEN=12`.
- **Image:** `ghcr.io/rubenvitt/lagerbuch`, **public**, multi-arch `linux/amd64,linux/arm64`. Tags: `edge` + `sha-<sha>` on `main`, `vX.Y.Z` + `latest` on git tags.
- **Deployment file:** `compose.yaml` is **minimal — no Traefik, no external network**. Reverse proxy / TLS / DNS are the operator's job, documented in `deployment.md`.
- **Privacy:** no personal data (real org, domains, hostnames, plates) in any committed file. Use `DRK Bereitschaft Musterstadt`, `example.com`/`staging.example` placeholders.
- **Commits:** frequent, one per task. Do **not** push — pushing to the public repo waits for explicit user go-ahead. Commit trailer:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_014kZuFZYQZXBQN7VXP82hc2
  ```

---

## File Structure

| Path | Responsibility | Task |
|---|---|---|
| `mise.toml` | Pin Node 24 + pnpm | 1 |
| `package.json` | Deps + scripts | 1 |
| `tsconfig.json` | TS strict, `@/*` alias | 1 |
| `next.config.ts` | `output: "standalone"` | 1 |
| `postcss.config.mjs` | Tailwind 4 PostCSS plugin | 1 |
| `.eslintrc.json` | `next/core-web-vitals` + TS | 1 |
| `vitest.config.ts` | Unit-test runner | 1 |
| `src/app/layout.tsx` | Root layout, fonts, metadata | 1 → 2 |
| `src/app/globals.css` | Tailwind import + `@theme` tokens + ported component CSS | 1 → 2 |
| `src/app/page.tsx` | Temp placeholder → replaced by Gate route group | 1 → 6 |
| `public/.gitkeep` | Keep empty `public/` for Docker copy | 1 |
| `src/lib/config.ts` | zod env parsing → typed `config` singleton | 3 |
| `src/lib/config.test.ts` | Config unit tests | 3 |
| `src/app/api/health/route.ts` | `/api/health` → `{status:"ok"}` | 4 |
| `src/app/api/health/route.test.ts` | Health unit test | 4 |
| `src/app/manifest.webmanifest/route.ts` | Runtime PWA manifest from config | 5 |
| `src/app/manifest.webmanifest/route.test.ts` | Manifest unit test | 5 |
| `src/components/Gate.tsx` | Ported Gate UI (client) | 6 |
| `src/app/(gate)/page.tsx` | Server page: reads config, renders Gate | 6 |
| `playwright.config.ts` | E2E config (webServer or external base URL) | 6 |
| `e2e/gate.spec.ts` | Gate smoke test | 6 |
| `Dockerfile` | Multi-stage standalone build | 7 |
| `.dockerignore` | Trim build context | 7 |
| `compose.yaml` | Minimal deploy (no Traefik) | 8 |
| `stack.env.example` | Env template | 8 |
| `generate-secrets.sh` | Fill secrets, prompt OIDC | 8 |
| `deployment.md` | Operator runbook | 8 |
| `.github/workflows/ci.yaml` | check / e2e / publish | 9 |

---

## Task 1: Toolchain & Next.js scaffold

**Files:**
- Create: `mise.toml`, `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `.eslintrc.json`, `vitest.config.ts`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`, `public/.gitkeep`

**Interfaces:**
- Produces: a building Next.js app; `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test` all runnable. Later tasks add files under `src/`.

- [ ] **Step 1: Pin toolchain**

Create `mise.toml`:
```toml
[tools]
node = "24"
pnpm = "11"
```
Run:
```bash
cd /Users/rubeen/dev/personal/drk/lagerbuch
mise trust && mise install
```
Expected: mise installs/activates Node 24 + pnpm 11.

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "lagerbuch",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@11.10.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test"
  },
  "dependencies": {
    "next": "^15.1.6",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "lucide-react": "^0.474.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@playwright/test": "^1.50.0",
    "@tailwindcss/postcss": "^4.0.0",
    "@types/node": "^22.10.7",
    "@types/react": "^19.0.7",
    "@types/react-dom": "^19.0.3",
    "@vitejs/plugin-react": "^4.3.4",
    "eslint": "^9.18.0",
    "eslint-config-next": "^15.1.6",
    "jsdom": "^26.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.3",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 3: Config files**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```
`next.config.ts`:
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```
`postcss.config.mjs`:
```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```
`.eslintrc.json`:
```json
{ "extends": ["next/core-web-vitals", "next/typescript"] }
```
`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
```

- [ ] **Step 4: Minimal app files**

`src/app/globals.css`:
```css
@import "tailwindcss";
```
`src/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lagerbuch",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
```
`src/app/page.tsx`:
```tsx
export default function Home() {
  return <main>Lagerbuch – Walking Skeleton</main>;
}
```
Create empty `public/.gitkeep` (touch the file).

- [ ] **Step 5: Install & verify build**

Run:
```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
```
Expected: `pnpm install` writes `pnpm-lock.yaml`; `pnpm build` succeeds and prints `.next/standalone` in output; typecheck/lint clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 15 + Tailwind 4 + pnpm/mise toolchain"
```

---

## Task 2: Design system — tokens, fonts, ported stylesheet

**Files:**
- Modify: `src/app/globals.css`, `src/app/layout.tsx`

**Interfaces:**
- Produces: CSS custom properties `--rot`, `--tinte`, `--stahl`, `--display`, `--body`, `--mono` … and all mockup component classes (`.card`, `.btn`, `.gate`, `.gatecard`, `.tokeninput`, `.input`, `.footnote`, `.demochip`, …) available globally. Tailwind color utilities `bg-rot`, `text-tinte`, etc. via `@theme`.

- [ ] **Step 1: Wire self-hosted fonts in layout**

Replace `src/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import { Barlow, Barlow_Condensed, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});
const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lagerbuch",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="de"
      className={`${barlow.variable} ${barlowCondensed.variable} ${plexMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Build `globals.css` — Tailwind import + `@theme` tokens + font aliases**

Replace `src/app/globals.css` with the following header, **then append the component CSS** (Step 3):
```css
@import "tailwindcss";

@theme {
  --color-rot: #c8000f;
  --color-rot-dk: #a2000c;
  --color-rot-bg: #fbe9eb;
  --color-tinte: #1a1d20;
  --color-stahl: #5b6570;
  --color-linie: #d9dde1;
  --color-papier: #eef0f1;
  --color-karte: #ffffff;
  --color-gelb: #b26a00;
  --color-gelb-bg: #fbf1dc;
  --color-ok: #1e7a3c;
  --color-ok-bg: #e4f2e9;
}

:root {
  /* aliases so the ported mockup CSS resolves unchanged */
  --rot: var(--color-rot);
  --rot-dk: var(--color-rot-dk);
  --rot-bg: var(--color-rot-bg);
  --tinte: var(--color-tinte);
  --stahl: var(--color-stahl);
  --linie: var(--color-linie);
  --papier: var(--color-papier);
  --karte: var(--color-karte);
  --gelb: var(--color-gelb);
  --gelb-bg: var(--color-gelb-bg);
  --ok: var(--color-ok);
  --ok-bg: var(--color-ok-bg);
  --display: var(--font-display), "Arial Narrow", sans-serif;
  --body: var(--font-body), system-ui, sans-serif;
  --mono: var(--font-mono), ui-monospace, monospace;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: var(--body); }
button { font: inherit; cursor: pointer; background: none; border: none; color: inherit; }
button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--tinte); outline-offset: 2px; border-radius: 6px; }
input, select { font: inherit; }
```

- [ ] **Step 3: Append the mockup component classes**

Open `mockup.jsx` and copy the CSS from the `CSS` template literal — **the block from `.root{...}` (the line after `--mono` in `:root`) through the closing `}` of the `@media (max-width:760px)` rule** (i.e. everything after the `:root{…}` block and `*{}`/`body{}`/`button{}` resets, which you already added in Step 2). Do **not** copy: the leading `@import url('https://fonts.googleapis.com/...')` line, the `:root{…}` variable block, or the `*`/`body`/`button`/`input` reset rules (already added). Paste it at the end of `globals.css`.

Result: `globals.css` contains the Tailwind import, `@theme`, `:root` aliases, resets, then `.root`, `.card`, `.btn*`, `.gate*`, `.stepper`, `.chip*`, `.tbl`, `.drawer*`, the phone/admin frames, and the `@media` block — all referencing the same `--rot`/`--display`/… variables.

- [ ] **Step 4: Verify build & fonts**

Run:
```bash
pnpm build
```
Expected: build succeeds; output mentions downloading Google fonts at build time (self-hosted). No `fonts.googleapis.com` reference should remain in `globals.css` (verify: `grep -c "googleapis" src/app/globals.css` prints `0`).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: port design tokens, self-hosted fonts, and mockup stylesheet"
```

---

## Task 3: Config module (zod env parsing)

**Files:**
- Create: `src/lib/config.ts`, `src/lib/config.test.ts`

**Interfaces:**
- Produces:
  - `parseConfig(env: NodeJS.ProcessEnv): AppConfig` — pure, throws `Error` on invalid input.
  - `config: AppConfig` — singleton parsed from `process.env` at import.
  - `interface AppConfig` with fields: `appName: string`, `appOrg: string`, `appTagline: string`, `appBaseUrl: string`, `databasePath: string`, `tz: string`, `warnTageKritisch: number`, `warnTageFaellig: number`, `bestellFaktor: number`, `helferSessionStunden: number`.
- Consumed by: manifest route (Task 5), Gate page (Task 6), layout title (Task 6 optional).

- [ ] **Step 1: Write the failing tests**

`src/lib/config.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { parseConfig } from "./config";

describe("parseConfig", () => {
  it("applies defaults for an empty environment", () => {
    const c = parseConfig({});
    expect(c.appName).toBe("Lagerbuch");
    expect(c.appOrg).toBe("");
    expect(c.appTagline).toBe("Materialverwaltung");
    expect(c.appBaseUrl).toBe("http://localhost:3000");
    expect(c.databasePath).toBe("/data/lagerbuch.db");
    expect(c.tz).toBe("Europe/Berlin");
    expect(c.warnTageKritisch).toBe(31);
    expect(c.warnTageFaellig).toBe(56);
    expect(c.bestellFaktor).toBe(2);
    expect(c.helferSessionStunden).toBe(12);
  });

  it("reads overrides and coerces numbers", () => {
    const c = parseConfig({
      APP_ORG: "DRK Bereitschaft Musterstadt",
      WARN_TAGE_KRITISCH: "14",
      BESTELL_FAKTOR: "3",
    });
    expect(c.appOrg).toBe("DRK Bereitschaft Musterstadt");
    expect(c.warnTageKritisch).toBe(14);
    expect(c.bestellFaktor).toBe(3);
  });

  it("throws on a non-numeric warn window", () => {
    expect(() => parseConfig({ WARN_TAGE_KRITISCH: "bald" })).toThrow();
  });

  it("throws on an invalid base URL", () => {
    expect(() => parseConfig({ APP_BASE_URL: "not-a-url" })).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/config.test.ts`
Expected: FAIL — `parseConfig` not found / module missing.

- [ ] **Step 3: Implement `src/lib/config.ts`**

```ts
import { z } from "zod";

export interface AppConfig {
  appName: string;
  appOrg: string;
  appTagline: string;
  appBaseUrl: string;
  databasePath: string;
  tz: string;
  warnTageKritisch: number;
  warnTageFaellig: number;
  bestellFaktor: number;
  helferSessionStunden: number;
}

const EnvSchema = z.object({
  APP_NAME: z.string().default("Lagerbuch"),
  APP_ORG: z.string().default(""),
  APP_TAGLINE: z.string().default("Materialverwaltung"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_PATH: z.string().default("/data/lagerbuch.db"),
  TZ: z.string().default("Europe/Berlin"),
  WARN_TAGE_KRITISCH: z.coerce.number().int().positive().default(31),
  WARN_TAGE_FAELLIG: z.coerce.number().int().positive().default(56),
  BESTELL_FAKTOR: z.coerce.number().positive().default(2),
  HELFER_SESSION_STUNDEN: z.coerce.number().int().positive().default(12),
});

export function parseConfig(env: NodeJS.ProcessEnv): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = JSON.stringify(parsed.error.flatten().fieldErrors);
    throw new Error(`Ungültige Umgebungskonfiguration: ${issues}`);
  }
  const e = parsed.data;
  return {
    appName: e.APP_NAME,
    appOrg: e.APP_ORG,
    appTagline: e.APP_TAGLINE,
    appBaseUrl: e.APP_BASE_URL,
    databasePath: e.DATABASE_PATH,
    tz: e.TZ,
    warnTageKritisch: e.WARN_TAGE_KRITISCH,
    warnTageFaellig: e.WARN_TAGE_FAELLIG,
    bestellFaktor: e.BESTELL_FAKTOR,
    helferSessionStunden: e.HELFER_SESSION_STUNDEN,
  };
}

export const config = parseConfig(process.env);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/config.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add zod-validated config module with startup validation"
```

---

## Task 4: Health endpoint

**Files:**
- Create: `src/app/api/health/route.ts`, `src/app/api/health/route.test.ts`

**Interfaces:**
- Produces: `GET()` → `NextResponse` with status 200 and JSON body `{ status: "ok" }`. Consumed by Docker HEALTHCHECK (Task 7), Playwright readiness (Task 6), CI wait-loop (Task 9).

- [ ] **Step 1: Write the failing test**

`src/app/api/health/route.test.ts`:
```ts
import { expect, it } from "vitest";
import { GET } from "./route";

it("health responds 200 with status ok", async () => {
  const res = GET();
  expect(res.status).toBe(200);
  await expect(res.json()).resolves.toEqual({ status: "ok" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/app/api/health/route.test.ts`
Expected: FAIL — module/`GET` not found.

- [ ] **Step 3: Implement the route**

`src/app/api/health/route.ts`:
```ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ status: "ok" });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/app/api/health/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add /api/health endpoint"
```

---

## Task 5: PWA manifest route

**Files:**
- Create: `src/app/manifest.webmanifest/route.ts`, `src/app/manifest.webmanifest/route.test.ts`

**Interfaces:**
- Consumes: `config` from Task 3.
- Produces: `GET()` → `Response` with `Content-Type: application/manifest+json`; body includes `name` (= `appName` + ` · ` + `appOrg` when `appOrg` non-empty, else `appName`), `short_name`, `description`, `display: "standalone"`.

- [ ] **Step 1: Write the failing test**

`src/app/manifest.webmanifest/route.test.ts`:
```ts
import { expect, it } from "vitest";
import { GET } from "./route";

it("manifest reflects config and sets the manifest content type", async () => {
  const res = GET();
  expect(res.headers.get("Content-Type")).toBe("application/manifest+json");
  const body = await res.json();
  expect(body.short_name).toBe("Lagerbuch");
  expect(body.display).toBe("standalone");
  // APP_ORG defaults to "" in the test env → name is just the app name
  expect(body.name).toBe("Lagerbuch");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/app/manifest.webmanifest/route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route**

`src/app/manifest.webmanifest/route.ts`:
```ts
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export function GET() {
  const name = config.appOrg
    ? `${config.appName} · ${config.appOrg}`
    : config.appName;

  const manifest = {
    name,
    short_name: config.appName,
    description: config.appTagline,
    start_url: "/",
    display: "standalone",
    background_color: "#EEF0F1",
    theme_color: "#C8000F",
    icons: [] as unknown[],
  };

  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/app/manifest.webmanifest/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Reference the manifest from the layout**

In `src/app/layout.tsx`, extend the `metadata` export:
```tsx
export const metadata: Metadata = {
  title: "Lagerbuch",
  manifest: "/manifest.webmanifest",
};
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add config-driven webmanifest route"
```

---

## Task 6: Gate page + Playwright smoke test

**Files:**
- Create: `src/components/Gate.tsx`, `src/app/(gate)/page.tsx`, `playwright.config.ts`, `e2e/gate.spec.ts`
- Delete: `src/app/page.tsx` (replaced by the `(gate)` route group)

**Interfaces:**
- Consumes: `config` (Task 3).
- Produces: the `/` route renders the Gate with branding. `Gate` is a client component receiving `branding: { appName: string; appOrg: string; appTagline: string }`. In M0 the code field is a controlled input and both buttons are inert placeholders (real token/OIDC wiring lands in M1/M2).

- [ ] **Step 1: Write the failing smoke test + Playwright config**

`playwright.config.ts`:
```ts
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
        env: { APP_ORG: "DRK Bereitschaft Musterstadt" },
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
```
`e2e/gate.spec.ts`:
```ts
import { expect, test } from "@playwright/test";

test("gate renders brand, tagline, org and the two entry cards", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("LAGER", { exact: false })).toBeVisible();
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec playwright install chromium` then `pnpm e2e`
Expected: FAIL — org text / headings not found (page still shows placeholder).

- [ ] **Step 3: Implement the Gate component**

`src/components/Gate.tsx` (ported from `mockup.jsx` `Gate`, trimmed to M0 — no token list, buttons inert):
```tsx
"use client";

import { useState } from "react";
import { Key, QrCode } from "lucide-react";

export interface GateBranding {
  appName: string;
  appOrg: string;
  appTagline: string;
}

export function Gate({ branding }: { branding: GateBranding }) {
  const [code, setCode] = useState("");

  return (
    <div className="gate">
      <div className="gatebar" />
      <div className="gatebrand">
        LAGER<span>BUCH</span>
      </div>
      <div className="gatesub">
        {branding.appOrg ? `${branding.appOrg} · ` : ""}
        {branding.appTagline}
      </div>
      <div className="gatecards">
        <div className="gatecard">
          <h2>Im Dienst</h2>
          <p>
            Für Helfer:innen: Code vom Regal- oder Fahrzeugetikett eingeben –
            ohne Konto, ohne Passwort. Nur Entnahme &amp; Fahrzeug-Check.
          </p>
          <input
            className="input tokeninput"
            placeholder="000-000"
            value={code}
            aria-label="Zugangs-Code"
            onChange={(e) => setCode(e.target.value)}
          />
          <button className="btn btn-rot" disabled>
            Weiter
          </button>
          <button className="btn btn-ghost" disabled>
            <QrCode size={16} /> Fahrzeug-Code scannen
          </button>
        </div>
        <div className="gatecard">
          <h2>Verwaltung</h2>
          <p>
            Volles Lagerbuch: Artikel &amp; Chargen, Soll-Bestückung der
            Fahrzeuge, Bestellvorschläge, Journal und Zugangs-Codes.
          </p>
          <div style={{ flex: 1 }} />
          <button className="btn btn-tinte" disabled>
            <Key size={16} /> Mit Pocket ID anmelden
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement the server page & remove the placeholder**

Delete `src/app/page.tsx`. Create `src/app/(gate)/page.tsx`:
```tsx
import { Gate } from "@/components/Gate";
import { config } from "@/lib/config";

export default function GatePage() {
  return (
    <Gate
      branding={{
        appName: config.appName,
        appOrg: config.appOrg,
        appTagline: config.appTagline,
      }}
    />
  );
}
```

- [ ] **Step 5: Run the smoke test to verify it passes**

Run: `pnpm e2e`
Expected: PASS (dev server boots, org branding visible).

- [ ] **Step 6: Verify build & typecheck**

Run: `pnpm build && pnpm typecheck && pnpm lint`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: render config-branded Gate page with e2e smoke test"
```

---

## Task 7: Dockerfile & container verification

**Files:**
- Create: `Dockerfile`, `.dockerignore`

**Interfaces:**
- Produces: an image that serves the app on port 3000 and passes its own HEALTHCHECK. Consumed by `compose.yaml` (Task 8) and CI (Task 9).

- [ ] **Step 1: Write `.dockerignore`**

```
node_modules
.next
.git
data
stack.env
.env
.env*.local
e2e
playwright-report
test-results
coverage
docs
**/*.test.ts
**/*.test.tsx
```

- [ ] **Step 2: Write the `Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1
FROM node:24-slim AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24-slim AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
```

- [ ] **Step 3: Build the image**

Run:
```bash
docker build -t lagerbuch:dev .
```
Expected: build succeeds; final stage copies `.next/standalone`, `.next/static`, `public`.

- [ ] **Step 4: Run the container and verify health + Gate**

Run:
```bash
docker run -d --name lb -p 3000:3000 -e APP_ORG="DRK Bereitschaft Musterstadt" lagerbuch:dev
sleep 5
curl -sf http://localhost:3000/api/health
curl -s http://localhost:3000/ | grep -o "DRK Bereitschaft Musterstadt"
docker rm -f lb
```
Expected: health prints `{"status":"ok"}`; the grep prints the org string (branding served from the running container).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add standalone Dockerfile with healthcheck"
```

---

## Task 8: Deployment files (minimal compose, secrets, runbook)

**Files:**
- Create: `compose.yaml`, `stack.env.example`, `generate-secrets.sh`, `deployment.md`

**Interfaces:**
- Produces: operator-facing deploy artifacts. No Traefik/network — the operator adds reverse proxy externally.

- [ ] **Step 1: Write `compose.yaml` (minimal, no Traefik)**

```yaml
services:
  lagerbuch:
    image: ghcr.io/rubenvitt/lagerbuch:${IMAGE_TAG:-edge}
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - TZ=${TZ:-Europe/Berlin}
      - APP_NAME=${APP_NAME:-Lagerbuch}
      - APP_ORG=${APP_ORG:-}
      - APP_TAGLINE=${APP_TAGLINE:-Materialverwaltung}
      - APP_BASE_URL=${APP_BASE_URL}
      - DATABASE_PATH=/data/lagerbuch.db
      - AUTH_SECRET=${AUTH_SECRET}
      - HELFER_SESSION_SECRET=${HELFER_SESSION_SECRET}
      - OIDC_ISSUER=${OIDC_ISSUER}
      - OIDC_CLIENT_ID=${OIDC_CLIENT_ID}
      - OIDC_CLIENT_SECRET=${OIDC_CLIENT_SECRET}
      - OIDC_ADMIN_GROUP=${OIDC_ADMIN_GROUP:-lagerbuch-admin}
    volumes:
      - lagerbuch_data:/data
    ports:
      - "${HOST_PORT:-3000}:3000"

volumes:
  lagerbuch_data:
```

- [ ] **Step 2: Write `stack.env.example`**

```bash
# ── STATIC (adjust per stack) ──────────────────────────────
IMAGE_TAG=edge                          # Prod: vX.Y.Z (tagged releases only)
APP_NAME=Lagerbuch
APP_ORG=DRK Bereitschaft Musterstadt
APP_TAGLINE=Materialverwaltung
APP_BASE_URL=https://lagerbuch.example.com
HOST_PORT=3000
TZ=Europe/Berlin
OIDC_ADMIN_GROUP=lagerbuch-admin

# ── GENERATED (generate-secrets.sh) ────────────────────────
AUTH_SECRET=__GENERATE__
HELFER_SESSION_SECRET=__GENERATE__

# ── MANUAL (Pocket ID: one OIDC client per environment) ────
OIDC_ISSUER=https://id.example.com
OIDC_CLIENT_ID=__MANUAL__
OIDC_CLIENT_SECRET=__MANUAL__
```

- [ ] **Step 3: Write `generate-secrets.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

SRC="stack.env.example"
OUT="stack.env"

if [[ -f "$OUT" ]]; then
  read -rp "$OUT existiert bereits – überschreiben? [y/N] " ans
  [[ "$ans" == "y" || "$ans" == "Y" ]] || { echo "Abbruch."; exit 1; }
fi

cp "$SRC" "$OUT"

gen() { openssl rand -base64 48 | tr -d '\n'; }

# Replace generated secrets (portable in-place edit)
tmp="$(mktemp)"
while IFS= read -r line; do
  case "$line" in
    AUTH_SECRET=__GENERATE__)            echo "AUTH_SECRET=$(gen)" ;;
    HELFER_SESSION_SECRET=__GENERATE__)  echo "HELFER_SESSION_SECRET=$(gen)" ;;
    *)                                   echo "$line" ;;
  esac
done < "$OUT" > "$tmp"
mv "$tmp" "$OUT"

prompt_secret() {
  local key="$1" current="$2" val
  read -rp "$key [$current]: " val
  [[ -n "$val" ]] && sed -i.bak "s|^$key=.*|$key=$val|" "$OUT" && rm -f "$OUT.bak"
}

echo "OIDC-Werte aus Pocket ID (Enter = Beispielwert behalten):"
prompt_secret OIDC_ISSUER "https://id.example.com"
prompt_secret OIDC_CLIENT_ID "__MANUAL__"
prompt_secret OIDC_CLIENT_SECRET "__MANUAL__"

echo "✅ $OUT geschrieben. Liegt in .gitignore – niemals committen."
```
Then: `chmod +x generate-secrets.sh`.

- [ ] **Step 4: Write `deployment.md` (non-opinionated runbook)**

```markdown
# Lagerbuch – Deployment-Runbook

Nicht-opinioniertes Runbook. Reverse-Proxy, TLS und DNS liegen bewusst
außerhalb dieses Repos – betreibe sie mit dem Werkzeug deiner Wahl.

## Voraussetzungen
- Docker + Compose auf dem Host.
- Ein Reverse-Proxy (Traefik, Caddy, nginx …), der HTTPS terminiert und auf
  den veröffentlichten Port des Containers (Default `3000`) weiterleitet.

## Image
Public: `ghcr.io/rubenvitt/lagerbuch`.
Tags: `edge` (jeder `main`-Push), `sha-<sha>`, `vX.Y.Z` + `latest` (Releases).
Multi-Arch: `linux/amd64`, `linux/arm64`.

## Konfiguration
1. `./generate-secrets.sh` → erzeugt `stack.env` (AUTH_SECRET,
   HELFER_SESSION_SECRET zufällig; OIDC interaktiv). Datei ist gitignored.
2. Werte in `stack.env` prüfen: `APP_BASE_URL` = die öffentliche URL,
   `APP_ORG`, `IMAGE_TAG`, `HOST_PORT`.

| Variable | Zweck |
|---|---|
| `IMAGE_TAG` | `edge` (Staging) oder `vX.Y.Z` (Prod) |
| `APP_BASE_URL` | öffentliche URL (OIDC-Callbacks, QR-Deep-Links) |
| `APP_ORG` / `APP_NAME` / `APP_TAGLINE` | Branding |
| `HOST_PORT` | Host-Port → Container-Port 3000 |
| `AUTH_SECRET` / `HELFER_SESSION_SECRET` | Session-Signatur |
| `OIDC_*` | Pocket-ID-Client (ab M1) |

## Start
```bash
docker compose --env-file stack.env pull
docker compose --env-file stack.env up -d
```

## Health
```bash
curl -f http://<host>:${HOST_PORT:-3000}/api/health   # {"status":"ok"}
```
Der Container hat zusätzlich einen eingebauten HEALTHCHECK
(`docker ps` zeigt `healthy`).

## Reverse-Proxy (durch Betreiber)
Leite `https://<deine-domain>` → `http://<host>:<HOST_PORT>` weiter.
`APP_BASE_URL` muss exakt der öffentlichen URL entsprechen.

## Update
```bash
# stack.env: IMAGE_TAG anpassen (Staging bleibt edge)
docker compose --env-file stack.env pull
docker compose --env-file stack.env up -d
```

## Rollback
`IMAGE_TAG` auf den vorherigen Tag zurücksetzen, dann `pull` + `up -d`.
Migrationen sind additiv (expand/contract) – Rollback gefahrlos (ab M1).

## Backups (ab M1)
Der Container schreibt nächtliche SQLite-Snapshots nach `/data/backups/`
(Retention 14 Tage) im Named Volume `lagerbuch_data`. Die Host-Sicherung
nimmt diese Dateien konsistent mit. Restore = Container stoppen, Snapshot
nach `/data/lagerbuch.db` kopieren, Container starten.
```

- [ ] **Step 5: Verify compose config**

Run:
```bash
APP_BASE_URL=https://lagerbuch.example.com docker compose --env-file /dev/null config >/dev/null && echo "compose valid"
```
Expected: prints `compose valid` (compose parses; `APP_BASE_URL` provided inline).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add minimal compose, secrets generator, and deployment runbook"
```

---

## Task 9: CI/CD workflow

**Files:**
- Create: `.github/workflows/ci.yaml`

**Interfaces:**
- Produces: three jobs — `check` (lint/typecheck/test), `e2e` (build image, run container, Playwright), `publish` (multi-arch buildx push to GHCR on push events). No self-hosted runner.

- [ ] **Step 1: Write the workflow**

`.github/workflows/ci.yaml`:
```yaml
name: CI

on:
  push:
    branches: [main]
    tags: ["v*"]
  pull_request:
    branches: [main]

env:
  IMAGE: ghcr.io/${{ github.repository }}

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 11
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 11
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - name: Build image
        run: docker build -t lagerbuch:ci .
      - name: Run container
        run: |
          docker run -d --name lagerbuch -p 3000:3000 \
            -e APP_ORG="DRK Bereitschaft Musterstadt" \
            -e APP_BASE_URL="http://localhost:3000" \
            lagerbuch:ci
      - name: Wait for health
        run: |
          for i in $(seq 1 30); do
            if curl -sf http://localhost:3000/api/health; then echo " ok"; exit 0; fi
            sleep 2
          done
          echo "health never became ready"; docker logs lagerbuch; exit 1
      - name: Playwright
        env:
          PLAYWRIGHT_BASE_URL: http://localhost:3000
        run: pnpm exec playwright test

  publish:
    needs: [check, e2e]
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-qemu-action@v3
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/metadata-action@v5
        id: meta
        with:
          images: ${{ env.IMAGE }}
          tags: |
            type=edge,branch=main
            type=sha,prefix=sha-
            type=semver,pattern=v{{version}}
            type=raw,value=latest,enable=${{ startsWith(github.ref, 'refs/tags/v') }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

- [ ] **Step 2: Validate the workflow syntax**

Run (if `actionlint` available; else skip with a note):
```bash
which actionlint && actionlint .github/workflows/ci.yaml || echo "actionlint not installed – validate on first push"
```
Expected: no errors, or the skip note.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "ci: add check/e2e/publish workflow with multi-arch GHCR publish"
```

- [ ] **Step 4: HANDOFF CHECKPOINT — do not push yet**

Deploy-half of M0's DoD requires operator actions. Surface these to the user (do **not** perform without confirmation):
1. `gh repo create rubenvitt/lagerbuch --public --source=. --remote=origin` (confirm first).
2. `git push -u origin main` → triggers CI → first `edge` image in GHCR.
3. Make the GHCR package **public** (GitHub → Packages → lagerbuch → visibility).
4. Create the Portainer stack from `compose.yaml` + `stack.env`; point the reverse proxy at it.
5. Verify: staging serves the Gate page; `/api/health` is green.

---

## Self-Review

**Spec coverage (against `2026-07-10-lagerbuch-m0-m1-design.md` §4):**
- Project setup (pnpm/mise, Next 15/React 19/TS, standalone, ESLint, Vitest, Playwright, Tailwind 4) → Task 1 ✓
- Config module (zod, startup crash) → Task 3 ✓
- Branding from config (layout title, gate, manifest) → Tasks 5, 6 (+ layout metadata) ✓
- Gate page from mockup with `APP_ORG` branding → Task 6 ✓
- Design tokens `@theme` + self-hosted fonts → Task 2 ✓
- `/api/health` → Task 4 ✓
- `manifest.webmanifest` route → Task 5 ✓
- Dockerfile (`node:24-slim`, standalone, non-root, HEALTHCHECK) → Task 7 ✓
- `compose.yaml` (minimal, no Traefik) + `stack.env.example` + `generate-secrets.sh` → Task 8 ✓
- `deployment.md` runbook → Task 8 ✓
- CI (check/e2e/publish, multi-arch GHCR) → Task 9 ✓
- `.gitignore` → already committed in baseline ✓

**Placeholder scan:** No `TBD`/`TODO`/"add error handling"/"write tests for the above". The one deliberate deferral (Drizzle migration check in CI) belongs to M1 and is intentionally absent, not a placeholder.

**Type consistency:** `AppConfig` field names (`appOrg`, `appTagline`, `appName`, …) defined in Task 3 are used identically in Tasks 5 & 6. `GateBranding` (Task 6) matches the props passed by `(gate)/page.tsx`. `GET()` signatures (Tasks 4, 5) return `Response`/`NextResponse` consistently with their tests.

**Deferred to M1 (not in scope, by design):** Drizzle schema/migrations/triggers, `instrumentation.ts`, Auth.js OIDC + dev demo-login, domain functions, server actions, Verwaltung UI, CSV import, DB-backed health check. These get their own plan after the M0 checkpoint.
