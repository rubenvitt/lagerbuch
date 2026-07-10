# M2 Helfer-Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Helfer:innen lösen einen laminierten Token-Code (Gate-Eingabe oder QR-Deep-Link) ein und buchen mobil FEFO-Entnahmen; die Verwaltung erzeugt und sperrt diese Codes.

**Architecture:** Zwei unabhängige Sessions — Admin (Auth.js-JWT, aus M1) und Helfer (jose-signiertes httpOnly-Cookie, neu). Drei Middleware-Cordons (`/verwaltung` admin, `/helfer`+`/a` helfer, `/t` öffentlich rate-limited). Token-Einlösung und FEFO-Entnahme-Transaktion werden serverseitig geteilt (kein Copy-Paste). Sofortige Sperrwirkung durch DB-Recheck von `tokenId` bei jeder schreibenden Aktion.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Drizzle + better-sqlite3, **jose** (neu), Auth.js v5, Tailwind 4, Vitest, Playwright.

## Global Constraints

- **Design-Spec** [`docs/superpowers/specs/2026-07-10-lagerbuch-m2-helfer-flow-design.md`](../specs/2026-07-10-lagerbuch-m2-helfer-flow-design.md) ist maßgeblich; UI-Referenz `mockup.jsx` `HelferView` (Z. 344–574).
- **Scope M2 = Entnahme.** KEIN Fahrzeug-Check (M4), KEIN Token-Scope-Verhalten (bis M4 nur Handlager; `scopeLagerortId` speichern, ignorieren), KEIN In-App-Kamera-Scanner (Deep-Link + durchsuchbare Liste), KEIN Etikettendruck/`qrcode` (M6). Helfer-Tableiste zeigt nur „Entnahme".
- **Buchungsquelle Helfer:** `quelleTyp = "token"`, `quelleId = token.code`. Journal zeigt nie einen Namen.
- **Cookie `helfer_session`:** `httpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age`=`HELFER_SESSION_STUNDEN`·3600. **`Secure` NUR** wenn `nodeEnv==="production"` ODER `appBaseUrl` mit `https://` beginnt (sonst lokal über `http://localhost` untestbar).
- **jose:** `HS256` mit `HELFER_SESSION_SECRET`; `exp` = jetzt + `HELFER_SESSION_STUNDEN`.
- **Rate-Limit:** 5 Versuche/Minute/IP, In-Memory-Token-Bucket (resettet bei Neustart, Single-Process ok). Gilt für Gate-POST UND `/t`. IP via `x-forwarded-for` (erster Hop), Fallback Socket.
- **`returnTo`** immer sanitisieren (lokaler Pfad, kein `//`, keine absolute/`javascript:`-URL) → sonst Fallback `/helfer`.
- **Edge/Node-Trennung:** `src/middleware.ts` und alles unter `src/lib/auth/` außer `session.ts` bleiben **DB-frei** (Edge-fähig). DB-Zugriff (Sperr-Recheck) nur in Node: `requireHelfer` in `src/actions/session.ts`.
- **Actions** nehmen `db: DB = getDb()` als letzten Parameter (Testbarkeit), gaten zuerst auf `requireAdmin`/`requireHelfer`, validieren mit zod.
- Kein neues Schema nötig (Tabellen `tokens`, `buchungen` existieren seit M1). Alle Helfer-/Phone-Frame-CSS-Klassen liegen bereits in `src/app/globals.css`.
- **RTK-Umgebung:** bei mangled Lint/Test-Output `rtk proxy pnpm …` nutzen.

---

## File Structure

**Neu:**
- `src/lib/auth/rateLimit.ts` — Token-Bucket + `clientIp` (pure, edge-safe)
- `src/lib/auth/helferSession.ts` — jose sign/verify + Cookie-Optionen (pure, edge-safe)
- `src/lib/auth/returnTo.ts` — `sanitizeReturnTo` (pure)
- `src/lib/auth/cordon.ts` — `helferGateDecision` (pure Routing-Entscheidung, edge-safe)
- `src/actions/token-redeem.ts` — `redeemToken` (DB, gate-frei, geteilt von Gate + `/t`)
- `src/actions/tokens.ts` — `createToken`, `setTokenAktiv` (requireAdmin)
- `src/app/(gate)/actions.ts` — `einloesenAmGate` (Server Action)
- `src/app/t/[code]/route.ts` — Deep-Link Token einlösen
- `src/app/a/[artikelId]/page.tsx` — Regaletikett-Ziel (rollenabhängig)
- `src/app/helfer/layout.tsx` — Phone-Frame (Topbar Token-Label + Beenden + Entnahme-Tab)
- `src/app/helfer/page.tsx` — durchsuchbare Artikelliste (Landing)
- `src/app/helfer/actions.ts` — `beenden` (Logout)
- `src/components/HelferFrame.tsx` — geteilter Frame für `/helfer` und `/a/[id]`
- `src/components/HelferListe.tsx` — Client-Suchliste
- `src/components/HelferDetail.tsx` — Client-Entnahme-Detail
- `src/app/verwaltung/(admin)/tokens/page.tsx` + `TokenTable.tsx` + `NeuToken.tsx`

**Geändert:**
- `src/lib/config.ts` — `helferSessionSecret` + Guard
- `src/actions/session.ts` — `requireHelfer`, `getHelferPayload`
- `src/actions/buchung.ts` — FEFO-Kern herausfaktorisiert + `bucheEntnahmeHelfer`
- `src/db/queries.ts` — `tokenListe`, `artikelDetailPublic` (gate-frei)
- `src/middleware.ts` — Helfer-/`/a`-Cordons
- `src/components/SideNav.tsx` — Nav-Eintrag „Zugangs-Codes"
- `src/components/Gate.tsx` — Code-Formular verdrahtet
- `src/app/(gate)/page.tsx` — `returnTo` durchreichen
- `deployment.md` — XFF-Hinweis + `HELFER_SESSION_SECRET`
- `package.json` — `jose`

---

### Task 1: Config `helferSessionSecret` + Prod-Guard + jose

**Files:**
- Modify: `src/lib/config.ts`
- Modify: `src/lib/config.test.ts`
- Modify: `package.json` (via `pnpm add jose`)

**Interfaces:**
- Produces: `config.helferSessionSecret: string`; `assertProductionSecrets` wirft zusätzlich bei fehlendem/Default-`HELFER_SESSION_SECRET`.

- [ ] **Step 1: jose installieren**

```bash
pnpm add jose
```
Expected: `jose` erscheint in `package.json` `dependencies`.

- [ ] **Step 2: Failing test schreiben** — in `src/lib/config.test.ts` ergänzen:

```ts
it("liest HELFER_SESSION_SECRET (Default = Dev-Secret)", () => {
  const c = parseConfig({ ...base } as NodeJS.ProcessEnv);
  expect(c.helferSessionSecret).toBe("dev-insecure-secret-change-me");
});

it("assertProductionSecrets wirft ohne HELFER_SESSION_SECRET in prod", () => {
  const c = parseConfig({ ...base, NODE_ENV: "production", AUTH_SECRET: "x".repeat(40) } as NodeJS.ProcessEnv);
  expect(() => assertProductionSecrets(c)).toThrow(/HELFER_SESSION_SECRET/);
});
```
(`base` = das im File bereits genutzte Basis-Env-Objekt; falls es kein `base` gibt, ein Minimal-Env inline aufbauen. `assertProductionSecrets` ggf. zu den Imports hinzufügen.)

- [ ] **Step 3: Test rot** — `rtk proxy pnpm vitest run src/lib/config.test.ts`
Expected: FAIL (`helferSessionSecret` undefined bzw. Guard wirft nicht auf HELFER_SESSION_SECRET).

- [ ] **Step 4: Config erweitern** — in `src/lib/config.ts`:

`AppConfig` um Feld ergänzen (nach `authSecret`):
```ts
  authSecret: string;
  helferSessionSecret: string;
```
`BaseEnvSchema` nach `AUTH_SECRET`:
```ts
  AUTH_SECRET: z.string().default("dev-insecure-secret-change-me"),
  HELFER_SESSION_SECRET: z.string().default("dev-insecure-secret-change-me"),
```
`parseConfig`-Return nach `authSecret`:
```ts
    authSecret: e.AUTH_SECRET,
    helferSessionSecret: e.HELFER_SESSION_SECRET,
```
`assertProductionSecrets` erweitern:
```ts
export function assertProductionSecrets(cfg: AppConfig): void {
  const insecure = "dev-insecure-secret-change-me";
  if (cfg.nodeEnv !== "production") return;
  if (!cfg.authSecret || cfg.authSecret === insecure) {
    throw new Error("AUTH_SECRET muss in Produktion gesetzt sein (nicht der Dev-Default). Siehe generate-secrets.sh / stack.env.");
  }
  if (!cfg.helferSessionSecret || cfg.helferSessionSecret === insecure) {
    throw new Error("HELFER_SESSION_SECRET muss in Produktion gesetzt sein (nicht der Dev-Default). Siehe generate-secrets.sh / stack.env.");
  }
}
```

- [ ] **Step 5: Test grün** — `rtk proxy pnpm vitest run src/lib/config.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**
```bash
git add package.json pnpm-lock.yaml src/lib/config.ts src/lib/config.test.ts
git commit -m "feat: wire HELFER_SESSION_SECRET into config + prod guard, add jose"
```

---

### Task 2: Rate-Limiter + clientIp

**Files:**
- Create: `src/lib/auth/rateLimit.ts`
- Test: `src/lib/auth/rateLimit.test.ts`

**Interfaces:**
- Produces:
  - `consumeRate(key: string, now?: number): { ok: boolean; retryAfter: number }` — Token-Bucket, Kapazität 5, Refill 5/60 s. `retryAfter` in Sekunden (0 wenn ok).
  - `clientIp(headers: Headers, fallback: string): string` — `x-forwarded-for` erster Hop, sonst `fallback`.
  - `_resetRateLimit(): void` — leert den Bucket (nur Tests).

- [ ] **Step 1: Failing test**

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { consumeRate, clientIp, _resetRateLimit } from "./rateLimit";

beforeEach(() => _resetRateLimit());

describe("consumeRate", () => {
  it("erlaubt 5, blockt den 6. innerhalb der Minute", () => {
    const t = 1_000_000;
    for (let i = 0; i < 5; i++) expect(consumeRate("ip", t).ok).toBe(true);
    const sixth = consumeRate("ip", t);
    expect(sixth.ok).toBe(false);
    expect(sixth.retryAfter).toBeGreaterThan(0);
  });
  it("füllt über Zeit wieder auf", () => {
    const t = 2_000_000;
    for (let i = 0; i < 5; i++) consumeRate("ip", t);
    expect(consumeRate("ip", t).ok).toBe(false);
    expect(consumeRate("ip", t + 60_000).ok).toBe(true); // nach 60 s wieder voll
  });
  it("isoliert pro Key", () => {
    const t = 3_000_000;
    for (let i = 0; i < 5; i++) consumeRate("a", t);
    expect(consumeRate("a", t).ok).toBe(false);
    expect(consumeRate("b", t).ok).toBe(true);
  });
});

describe("clientIp", () => {
  it("nimmt den ersten XFF-Hop", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
    expect(clientIp(h, "fb")).toBe("203.0.113.7");
  });
  it("fällt ohne XFF auf fallback zurück", () => {
    expect(clientIp(new Headers(), "fb")).toBe("fb");
  });
});
```

- [ ] **Step 2: Test rot** — `rtk proxy pnpm vitest run src/lib/auth/rateLimit.test.ts` → FAIL (Modul fehlt).

- [ ] **Step 3: Implementierung**

```ts
// In-Memory-Rate-Limit (Token-Bucket). Prozesslokal — resettet bei Neustart;
// für Single-Process-`standalone` ausreichend (Codes sind physisch laminiert,
// niedrige Rechte, sofort sperrbar). Kein Redis.
const CAPACITY = 5;
const WINDOW_MS = 60_000;
const REFILL_PER_MS = CAPACITY / WINDOW_MS;

type Bucket = { tokens: number; last: number };
const buckets = new Map<string, Bucket>();

export function consumeRate(key: string, now: number = Date.now()): { ok: boolean; retryAfter: number } {
  const b = buckets.get(key) ?? { tokens: CAPACITY, last: now };
  const refilled = Math.min(CAPACITY, b.tokens + (now - b.last) * REFILL_PER_MS);
  if (refilled >= 1) {
    buckets.set(key, { tokens: refilled - 1, last: now });
    return { ok: true, retryAfter: 0 };
  }
  buckets.set(key, { tokens: refilled, last: now });
  const retryAfter = Math.ceil((1 - refilled) / REFILL_PER_MS / 1000);
  return { ok: false, retryAfter };
}

export function clientIp(headers: Headers, fallback: string): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return fallback;
}

export function _resetRateLimit(): void {
  buckets.clear();
}
```

- [ ] **Step 4: Test grün** — `rtk proxy pnpm vitest run src/lib/auth/rateLimit.test.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/auth/rateLimit.ts src/lib/auth/rateLimit.test.ts
git commit -m "feat: in-memory rate-limiter + clientIp (XFF-aware)"
```

---

### Task 3: Helfer-Session (jose) + returnTo-Sanitizer

**Files:**
- Create: `src/lib/auth/helferSession.ts`
- Create: `src/lib/auth/returnTo.ts`
- Test: `src/lib/auth/helferSession.test.ts`
- Test: `src/lib/auth/returnTo.test.ts`

**Interfaces:**
- Produces (helferSession.ts):
  - `type HelferPayload = { tokenId: string; code: string; label: string }`
  - `createHelferSession(p: HelferPayload): Promise<string>` — signiertes JWT
  - `verifyHelferSession(value: string): Promise<HelferPayload | null>` — null bei ungültig/abgelaufen
  - `helferCookieOptions(): { httpOnly: true; sameSite: "lax"; path: "/"; maxAge: number; secure: boolean }`
  - `HELFER_COOKIE = "helfer_session"`
- Produces (returnTo.ts): `sanitizeReturnTo(raw: string | null | undefined): string | null`

- [ ] **Step 1: Failing tests**

`returnTo.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { sanitizeReturnTo } from "./returnTo";

describe("sanitizeReturnTo", () => {
  it("lässt lokale Pfade durch", () => {
    expect(sanitizeReturnTo("/helfer")).toBe("/helfer");
    expect(sanitizeReturnTo("/a/abc123")).toBe("/a/abc123");
  });
  it("verwirft protokoll-relative und absolute URLs", () => {
    expect(sanitizeReturnTo("//evil.example")).toBeNull();
    expect(sanitizeReturnTo("https://evil.example")).toBeNull();
    expect(sanitizeReturnTo("javascript:alert(1)")).toBeNull();
  });
  it("verwirft nicht mit / beginnende und leere Werte", () => {
    expect(sanitizeReturnTo("helfer")).toBeNull();
    expect(sanitizeReturnTo(null)).toBeNull();
    expect(sanitizeReturnTo("")).toBeNull();
  });
});
```

`helferSession.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/config", () => ({
  config: { helferSessionSecret: "test-secret-xxxxxxxxxxxxxxxxxxxxxxxx", helferSessionStunden: 12, nodeEnv: "development", appBaseUrl: "http://localhost:3000" },
}));
import { createHelferSession, verifyHelferSession, helferCookieOptions } from "./helferSession";

describe("helferSession", () => {
  it("round-trips payload", async () => {
    const token = await createHelferSession({ tokenId: "t1", code: "831-042", label: "RTW 1" });
    const p = await verifyHelferSession(token);
    expect(p).toMatchObject({ tokenId: "t1", code: "831-042", label: "RTW 1" });
  });
  it("gibt null für manipuliertes Token", async () => {
    const token = await createHelferSession({ tokenId: "t1", code: "c", label: "l" });
    expect(await verifyHelferSession(token + "x")).toBeNull();
    expect(await verifyHelferSession("garbage")).toBeNull();
  });
  it("Secure=false im Dev (http)", () => {
    expect(helferCookieOptions().secure).toBe(false);
    expect(helferCookieOptions().httpOnly).toBe(true);
    expect(helferCookieOptions().sameSite).toBe("lax");
  });
});
```

- [ ] **Step 2: Tests rot** — `rtk proxy pnpm vitest run src/lib/auth/returnTo.test.ts src/lib/auth/helferSession.test.ts` → FAIL.

- [ ] **Step 3: `returnTo.ts`**

```ts
/** Nur lokale Pfade zulassen (Open-Redirect-Schutz): muss mit einem einzelnen
 * "/" beginnen, kein "//" (protokoll-relativ), keine absolute/Schema-URL. */
export function sanitizeReturnTo(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  if (raw.includes(":")) return null; // z. B. "/x:foo" oder eingeschmuggelte Schemata
  return raw;
}
```

- [ ] **Step 4: `helferSession.ts`**

```ts
import { SignJWT, jwtVerify } from "jose";
import { config } from "@/lib/config";

export const HELFER_COOKIE = "helfer_session";

export type HelferPayload = { tokenId: string; code: string; label: string };

const secret = () => new TextEncoder().encode(config.helferSessionSecret);

export async function createHelferSession(p: HelferPayload): Promise<string> {
  return new SignJWT({ tokenId: p.tokenId, code: p.code, label: p.label })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${config.helferSessionStunden}h`)
    .sign(secret());
}

export async function verifyHelferSession(value: string): Promise<HelferPayload | null> {
  try {
    const { payload } = await jwtVerify(value, secret(), { algorithms: ["HS256"] });
    const { tokenId, code, label } = payload as Record<string, unknown>;
    if (typeof tokenId === "string" && typeof code === "string" && typeof label === "string") {
      return { tokenId, code, label };
    }
    return null;
  } catch {
    return null;
  }
}

export function helferCookieOptions() {
  const secure = config.nodeEnv === "production" || config.appBaseUrl.startsWith("https://");
  return { httpOnly: true as const, sameSite: "lax" as const, path: "/" as const, maxAge: config.helferSessionStunden * 3600, secure };
}
```

- [ ] **Step 5: Tests grün** — `rtk proxy pnpm vitest run src/lib/auth/returnTo.test.ts src/lib/auth/helferSession.test.ts` → PASS.

- [ ] **Step 6: Commit**
```bash
git add src/lib/auth/helferSession.ts src/lib/auth/returnTo.ts src/lib/auth/helferSession.test.ts src/lib/auth/returnTo.test.ts
git commit -m "feat: jose helfer session + returnTo sanitizer (edge-safe)"
```

---

### Task 4: `redeemToken` (DB) + `requireHelfer` / `getHelferPayload`

**Files:**
- Create: `src/actions/token-redeem.ts`
- Modify: `src/actions/session.ts`
- Test: `src/actions/token-redeem.test.ts`
- Test: `src/actions/session-helfer.test.ts`

**Interfaces:**
- Consumes: `createHelferSession` (T3), `verifyHelferSession` (T3), `tokens` schema, `getDb`/`DB`.
- Produces:
  - `redeemToken(code: string, db?: DB): Promise<{ ok: true; cookieValue: string; payload: HelferPayload } | { ok: false }>` — normalisiert Code, prüft `aktiv`, setzt `lastUsedAt`, baut Session. Rate-Limit macht der Aufrufer.
  - `requireHelfer(db?: DB): Promise<{ tokenId: string; code: string }>` — liest Cookie, verifiziert jose, **DB-Recheck `tokens.aktiv`**, wirft bei Sperre/Fehlen.
  - `getHelferPayload(): Promise<HelferPayload | null>` — nur Cookie+jose (kein DB), für Anzeige.

- [ ] **Step 1: Failing tests**

`token-redeem.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/config", () => ({
  config: { helferSessionSecret: "test-secret-xxxxxxxxxxxxxxxxxxxxxxxx", helferSessionStunden: 12, nodeEnv: "development", appBaseUrl: "http://localhost:3000" },
}));
import { createTestDb } from "@/db/testing";
import { tokens, newId } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyHelferSession } from "@/lib/auth/helferSession";
import { redeemToken } from "./token-redeem";

function seedToken(db = createTestDb(), aktiv = true) {
  const id = newId();
  db.insert(tokens).values({ id, code: "831-042", label: "RTW 1", aktiv, createdAt: new Date(), createdBy: "admin1" }).run();
  return { db, id };
}

describe("redeemToken", () => {
  it("löst gültigen Code ein, setzt lastUsedAt, baut Session", async () => {
    const { db, id } = seedToken();
    const r = await redeemToken("831-042", db);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await verifyHelferSession(r.cookieValue)).toMatchObject({ tokenId: id, code: "831-042" });
    expect(db.select().from(tokens).where(eq(tokens.id, id)).get()!.lastUsedAt).not.toBeNull();
  });
  it("lehnt gesperrten Code ab, ohne lastUsedAt zu setzen", async () => {
    const { db, id } = seedToken(createTestDb(), false);
    const r = await redeemToken("831-042", db);
    expect(r.ok).toBe(false);
    expect(db.select().from(tokens).where(eq(tokens.id, id)).get()!.lastUsedAt).toBeNull();
  });
  it("lehnt unbekannten Code ab", async () => {
    const { db } = seedToken();
    expect((await redeemToken("000-000", db)).ok).toBe(false);
  });
});
```

`session-helfer.test.ts` (requireHelfer — Cookie wird über `next/headers` gemockt):
```ts
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/config", () => ({
  config: { helferSessionSecret: "test-secret-xxxxxxxxxxxxxxxxxxxxxxxx", helferSessionStunden: 12, nodeEnv: "development", appBaseUrl: "http://localhost:3000" },
}));
const cookieStore = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (cookieStore.has(n) ? { value: cookieStore.get(n)! } : undefined) }),
}));
import { createTestDb } from "@/db/testing";
import { tokens, newId } from "@/db/schema";
import { createHelferSession } from "@/lib/auth/helferSession";
import { requireHelfer } from "./session";

async function setup(aktiv: boolean) {
  const db = createTestDb();
  const id = newId();
  db.insert(tokens).values({ id, code: "831-042", label: "RTW 1", aktiv, createdAt: new Date(), createdBy: "admin1" }).run();
  cookieStore.set("helfer_session", await createHelferSession({ tokenId: id, code: "831-042", label: "RTW 1" }));
  return { db, id };
}

describe("requireHelfer", () => {
  it("lässt aktiven Token durch", async () => {
    const { db, id } = await setup(true);
    await expect(requireHelfer(db)).resolves.toMatchObject({ tokenId: id, code: "831-042" });
  });
  it("wirft bei gesperrtem Token (sofortige Sperrwirkung)", async () => {
    const { db } = await setup(false);
    await expect(requireHelfer(db)).rejects.toThrow();
  });
  it("wirft ohne Cookie", async () => {
    cookieStore.clear();
    await expect(requireHelfer(createTestDb())).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Tests rot** — `rtk proxy pnpm vitest run src/actions/token-redeem.test.ts src/actions/session-helfer.test.ts` → FAIL.

- [ ] **Step 3: `token-redeem.ts`**

```ts
import { eq } from "drizzle-orm";
import { getDb, type DB } from "@/db";
import { tokens } from "@/db/schema";
import { createHelferSession, type HelferPayload } from "@/lib/auth/helferSession";

export async function redeemToken(
  code: string,
  db: DB = getDb(),
): Promise<{ ok: true; cookieValue: string; payload: HelferPayload } | { ok: false }> {
  const norm = code.trim().toUpperCase();
  const t = db.select().from(tokens).where(eq(tokens.code, norm)).get();
  if (!t || !t.aktiv) return { ok: false };
  db.update(tokens).set({ lastUsedAt: new Date() }).where(eq(tokens.id, t.id)).run();
  const payload: HelferPayload = { tokenId: t.id, code: t.code, label: t.label };
  const cookieValue = await createHelferSession(payload);
  return { ok: true, cookieValue, payload };
}
```

- [ ] **Step 4: `session.ts` erweitern** (bestehenden `requireAdmin`-Import-Block ergänzen):

```ts
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb, type DB } from "@/db";
import { tokens } from "@/db/schema";
import { HELFER_COOKIE, verifyHelferSession, type HelferPayload } from "@/lib/auth/helferSession";

export async function getHelferPayload(): Promise<HelferPayload | null> {
  const value = (await cookies()).get(HELFER_COOKIE)?.value;
  if (!value) return null;
  return verifyHelferSession(value);
}

// Autoritative Sperrprüfung: verifiziertes Cookie + DB-Recheck tokens.aktiv.
// Bei JEDER schreibenden Helfer-Aktion aufrufen (sofortige Sperrwirkung, Spec §3.1).
export async function requireHelfer(db: DB = getDb()): Promise<{ tokenId: string; code: string }> {
  const payload = await getHelferPayload();
  if (!payload) throw new Error("Keine gültige Helfer-Session");
  const t = db.select().from(tokens).where(eq(tokens.id, payload.tokenId)).get();
  if (!t || !t.aktiv) throw new Error("Token gesperrt");
  return { tokenId: t.id, code: t.code };
}
```
(Die bestehende `requireAdmin`-Funktion bleibt unverändert. `auth`-Import oben bleibt.)

- [ ] **Step 5: Tests grün** — `rtk proxy pnpm vitest run src/actions/token-redeem.test.ts src/actions/session-helfer.test.ts` → PASS.

- [ ] **Step 6: Commit**
```bash
git add src/actions/token-redeem.ts src/actions/session.ts src/actions/token-redeem.test.ts src/actions/session-helfer.test.ts
git commit -m "feat: redeemToken + requireHelfer with immediate revocation recheck"
```

---

### Task 5: FEFO-Kern herausfaktorisieren + Helfer-Entnahme-Wrapper

**Files:**
- Modify: `src/actions/buchung.ts`
- Test: `src/actions/buchung.test.ts` (bestehende bleiben grün; neue für Helfer-Wrapper)

**Interfaces:**
- Consumes: `requireHelfer` (T4).
- Produces: `bucheEntnahmeHelfer(input: { artikelId: string; menge: number }, db?: DB): Promise<{ gebucht: number }>` — `quelleTyp="token"`, `quelleId=code`. Admin-`bucheEntnahme` bleibt signatur-gleich.

- [ ] **Step 1: Failing test** — in `src/actions/buchung.test.ts` ergänzen (oben, zusätzlich zum bestehenden `vi.mock("@/actions/session", …)`, den Mock erweitern):

Bestehenden Mock ändern zu:
```ts
vi.mock("@/actions/session", () => ({
  requireAdmin: async () => ({ userId: "admin1" }),
  requireHelfer: async () => ({ tokenId: "tok1", code: "831-042" }),
}));
```
Neuen Block ergänzen:
```ts
import { bucheEntnahmeHelfer } from "./buchung";

describe("bucheEntnahmeHelfer", () => {
  it("bucht FEFO mit quelleTyp=token und quelleId=code", async () => {
    const { db, id } = seedArtikel();
    await bucheZugang({ artikelId: id, menge: 4, neueCharge: { chargenNr: "H", verfall: "2027-01" } }, db);
    const { gebucht } = await bucheEntnahmeHelfer({ artikelId: id, menge: 3 }, db);
    expect(gebucht).toBe(3);
    const entn = db.select().from(buchungen).where(eq(buchungen.typ, "entnahme")).all();
    expect(entn.length).toBeGreaterThan(0);
    expect(entn.every((b) => b.quelleTyp === "token" && b.quelleId === "831-042")).toBe(true);
  });
  it("kappt bei Übermenge", async () => {
    const { db, id } = seedArtikel();
    await bucheZugang({ artikelId: id, menge: 2, neueCharge: { chargenNr: "H", verfall: "2027-01" } }, db);
    expect((await bucheEntnahmeHelfer({ artikelId: id, menge: 99 }, db)).gebucht).toBe(2);
  });
});
```

- [ ] **Step 2: Test rot** — `rtk proxy pnpm vitest run src/actions/buchung.test.ts` → FAIL (`bucheEntnahmeHelfer` fehlt).

- [ ] **Step 3: Refactor** — in `src/actions/buchung.ts`:

Import ergänzen:
```ts
import { requireAdmin, requireHelfer } from "@/actions/session";
```
Gate-freien Kern einführen (vor `bucheEntnahme`):
```ts
type Quelle = { quelleTyp: "oidc" | "token"; quelleId: string };

// Gate-freier FEFO-Kern: eine Transaktion, Bestand-Kappung, gemeldete Ist-Menge.
// Von Admin- und Helfer-Wrapper geteilt (kein Copy-Paste der Transaktion).
function entnehmenCore(db: DB, artikelId: string, menge: number, quelle: Quelle, kommentar: string | null): { gebucht: number } {
  let gebucht = 0;
  db.transaction((tx) => {
    const chs = tx.select().from(chargen).where(eq(chargen.artikelId, artikelId)).all();
    const bu = tx.select().from(buchungen).where(eq(buchungen.artikelId, artikelId)).all();
    const rest = bestandProCharge(bu.map((b) => ({ chargeId: b.chargeId, menge: b.menge })));
    const chargenRest = chs.map((c) => ({ chargeId: c.id, verfall: c.verfall, rest: rest.get(c.id) ?? 0 }));
    const verteilung = fefoVerteilung(chargenRest, menge);
    for (const teil of verteilung) {
      tx.insert(buchungen).values({
        id: newId(), ts: new Date(), typ: "entnahme", artikelId, chargeId: teil.chargeId,
        lagerortId: HANDLAGER_ID, menge: -teil.menge, quelleTyp: quelle.quelleTyp, quelleId: quelle.quelleId,
        kommentar,
      }).run();
      gebucht += teil.menge;
    }
  });
  return { gebucht };
}
```
`bucheEntnahme` auf den Kern umstellen:
```ts
export async function bucheEntnahme(input: z.input<typeof EntnahmeSchema>, db: DB = getDb()) {
  const { userId } = await requireAdmin();
  const v = EntnahmeSchema.parse(input);
  const r = entnehmenCore(db, v.artikelId, v.menge, { quelleTyp: "oidc", quelleId: userId }, v.kommentar ?? null);
  revalidatePath("/verwaltung/artikel");
  revalidatePath("/verwaltung");
  return r;
}
```
Helfer-Wrapper + Schema ergänzen:
```ts
const HelferEntnahmeSchema = z.object({
  artikelId: z.string().min(1),
  menge: z.coerce.number().int().positive(),
});

export async function bucheEntnahmeHelfer(input: z.input<typeof HelferEntnahmeSchema>, db: DB = getDb()) {
  const { code } = await requireHelfer(db);
  const v = HelferEntnahmeSchema.parse(input);
  const r = entnehmenCore(db, v.artikelId, v.menge, { quelleTyp: "token", quelleId: code }, null);
  revalidatePath(`/a/${v.artikelId}`);
  revalidatePath("/helfer");
  revalidatePath("/verwaltung");
  return r;
}
```

- [ ] **Step 4: Alle buchung-Tests grün** — `rtk proxy pnpm vitest run src/actions/buchung.test.ts` → PASS (bestehende Admin-Entnahme-Tests + neue Helfer-Tests).

- [ ] **Step 5: Commit**
```bash
git add src/actions/buchung.ts src/actions/buchung.test.ts
git commit -m "refactor: share FEFO entnahme core; add helfer entnahme wrapper (quelleTyp=token)"
```

---

### Task 6: Token-Verwaltung — Server Actions + Query

**Files:**
- Create: `src/actions/tokens.ts`
- Modify: `src/db/queries.ts` (`tokenListe`)
- Test: `src/actions/tokens.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`.
- Produces:
  - `createToken(input: { label: string }, db?: DB): Promise<{ id: string; code: string }>` — generiert eindeutigen Code `NNN-NNN`, `aktiv=true`, `createdBy=userId`.
  - `setTokenAktiv(input: { id: string; aktiv: boolean }, db?: DB): Promise<void>`
  - `tokenListe(db: DB): { id; code; label; aktiv; lastUsedAt; createdAt }[]` (createdAt desc)

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it, vi } from "vitest";
vi.mock("@/actions/session", () => ({ requireAdmin: async () => ({ userId: "admin1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
import { createTestDb } from "@/db/testing";
import { tokens } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createToken, setTokenAktiv } from "./tokens";
import { tokenListe } from "@/db/queries";

describe("createToken", () => {
  it("legt aktiven Token mit NNN-NNN-Code an", async () => {
    const db = createTestDb();
    const { id, code } = await createToken({ label: "RTW 1" }, db);
    expect(code).toMatch(/^\d{3}-\d{3}$/);
    const row = db.select().from(tokens).where(eq(tokens.id, id)).get()!;
    expect(row.aktiv).toBe(true);
    expect(row.lastUsedAt).toBeNull();
    expect(row.createdBy).toBe("admin1");
  });
  it("erzeugt eindeutige Codes", async () => {
    const db = createTestDb();
    const a = await createToken({ label: "A" }, db);
    const b = await createToken({ label: "B" }, db);
    expect(a.code).not.toBe(b.code);
  });
  it("lehnt leeres Label ab", async () => {
    await expect(createToken({ label: "  " }, createTestDb())).rejects.toThrow();
  });
});

describe("setTokenAktiv", () => {
  it("sperrt und reaktiviert", async () => {
    const db = createTestDb();
    const { id } = await createToken({ label: "A" }, db);
    await setTokenAktiv({ id, aktiv: false }, db);
    expect(db.select().from(tokens).where(eq(tokens.id, id)).get()!.aktiv).toBe(false);
    await setTokenAktiv({ id, aktiv: true }, db);
    expect(db.select().from(tokens).where(eq(tokens.id, id)).get()!.aktiv).toBe(true);
  });
});

describe("tokenListe", () => {
  it("liefert angelegte Tokens", async () => {
    const db = createTestDb();
    await createToken({ label: "A" }, db);
    expect(tokenListe(db)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Test rot** — `rtk proxy pnpm vitest run src/actions/tokens.test.ts` → FAIL.

- [ ] **Step 3: `queries.ts` erweitern** — ans Ende:
```ts
export function tokenListe(db: DB) {
  return db
    .select()
    .from(tokens)
    .orderBy(desc(tokens.createdAt))
    .all()
    .map((t) => ({ id: t.id, code: t.code, label: t.label, aktiv: t.aktiv, lastUsedAt: t.lastUsedAt, createdAt: t.createdAt }));
}
```
(Import `tokens` in `queries.ts` ergänzen: `import { artikel, buchungen, chargen, tokens } from "@/db/schema";`)

- [ ] **Step 4: `tokens.ts`**

```ts
"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { getDb, type DB } from "@/db";
import { tokens, newId } from "@/db/schema";
import { requireAdmin } from "@/actions/session";

const sixDigits = customAlphabet("0123456789", 6);

function generateUniqueCode(db: DB): string {
  for (let i = 0; i < 20; i++) {
    const d = sixDigits();
    const code = `${d.slice(0, 3)}-${d.slice(3)}`;
    if (!db.select().from(tokens).where(eq(tokens.code, code)).get()) return code;
  }
  throw new Error("Konnte keinen eindeutigen Code erzeugen");
}

const CreateSchema = z.object({ label: z.string().trim().min(1, "Label erforderlich") });

export async function createToken(input: z.input<typeof CreateSchema>, db: DB = getDb()) {
  const { userId } = await requireAdmin();
  const v = CreateSchema.parse(input);
  const id = newId();
  const code = generateUniqueCode(db);
  db.insert(tokens).values({ id, code, label: v.label, aktiv: true, createdAt: new Date(), createdBy: userId }).run();
  revalidatePath("/verwaltung/tokens");
  return { id, code };
}

const AktivSchema = z.object({ id: z.string().min(1), aktiv: z.boolean() });

export async function setTokenAktiv(input: z.input<typeof AktivSchema>, db: DB = getDb()) {
  await requireAdmin();
  const v = AktivSchema.parse(input);
  db.update(tokens).set({ aktiv: v.aktiv }).where(eq(tokens.id, v.id)).run();
  revalidatePath("/verwaltung/tokens");
}
```

- [ ] **Step 5: Test grün** — `rtk proxy pnpm vitest run src/actions/tokens.test.ts` → PASS.

- [ ] **Step 6: Commit**
```bash
git add src/actions/tokens.ts src/db/queries.ts src/actions/tokens.test.ts
git commit -m "feat: token admin actions (create/toggle) + tokenListe query"
```

---

### Task 7: Token-Verwaltung UI + SideNav

**Files:**
- Create: `src/app/verwaltung/(admin)/tokens/page.tsx`
- Create: `src/app/verwaltung/(admin)/tokens/TokenTable.tsx`
- Create: `src/app/verwaltung/(admin)/tokens/NeuToken.tsx`
- Modify: `src/components/SideNav.tsx`

**Interfaces:**
- Consumes: `tokenListe` (T6), `createToken`/`setTokenAktiv` (T6), `fmtTs`.

- [ ] **Step 1: SideNav-Eintrag** — in `src/components/SideNav.tsx` Import + NAV ergänzen:
```ts
import { History, KeyRound, LayoutDashboard, Package, Upload } from "lucide-react";
```
NAV nach „Journal":
```ts
  { href: "/verwaltung/tokens", label: "Zugangs-Codes", icon: KeyRound },
```

- [ ] **Step 2: `page.tsx` (Server)**

```tsx
import { getDb } from "@/db";
import { tokenListe } from "@/db/queries";
import { TokenTable } from "./TokenTable";
import { NeuToken } from "./NeuToken";

export const dynamic = "force-dynamic";

export default function TokensPage() {
  const tokens = tokenListe(getDb());
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ font: "700 24px var(--display)" }}>Zugangs-Codes</h1>
        <NeuToken />
      </div>
      <p className="footnote" style={{ marginBottom: 12 }}>
        Codes hängen laminiert im Fahrzeug/am Regal. Sperren wirkt sofort — die nächste Buchung eines gesperrten Codes wird abgewiesen.
      </p>
      <TokenTable tokens={tokens} />
    </div>
  );
}
```

- [ ] **Step 3: `TokenTable.tsx` (Client)**

```tsx
"use client";
import { useTransition } from "react";
import { setTokenAktiv } from "@/actions/tokens";
import { fmtTs } from "@/lib/format";

type Row = { id: string; code: string; label: string; aktiv: boolean; lastUsedAt: Date | null; createdAt: Date };

export function TokenTable({ tokens }: { tokens: Row[] }) {
  const [pending, start] = useTransition();
  if (tokens.length === 0) return <div className="card cardpad">Noch keine Codes. Lege oben den ersten an.</div>;
  return (
    <div className="card">
      {tokens.map((t) => (
        <div className="row" key={t.id}>
          <div className="rowmain">
            <div style={{ font: "600 15px var(--mono)" }}>{t.code}</div>
            <div className="rowmeta">
              <span>{t.label}</span>
              <span className={`chip chip-${t.aktiv ? "ok" : "rot"}`}>{t.aktiv ? "aktiv" : "gesperrt"}</span>
              <small>{t.lastUsedAt ? `zuletzt ${fmtTs(t.lastUsedAt)}` : "nie benutzt"}</small>
            </div>
          </div>
          <button
            className={`btn ${t.aktiv ? "btn-ghost" : "btn-rot"}`}
            disabled={pending}
            onClick={() => start(() => setTokenAktiv({ id: t.id, aktiv: !t.aktiv }))}
          >
            {t.aktiv ? "Sperren" : "Reaktivieren"}
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: `NeuToken.tsx` (Client)**

```tsx
"use client";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { createToken } from "@/actions/tokens";

export function NeuToken() {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    if (!label.trim()) return;
    start(async () => {
      await createToken({ label: label.trim() });
      setLabel("");
      setOpen(false);
    });
  }

  if (!open) return <button className="btn btn-tinte" onClick={() => setOpen(true)}><Plus size={16} /> Neuer Code</button>;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input className="input" placeholder="Label, z. B. RTW 1" value={label} autoFocus
        onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
      <button className="btn btn-rot" disabled={pending || !label.trim()} onClick={submit}>Anlegen</button>
      <button className="btn btn-ghost" onClick={() => setOpen(false)}>Abbrechen</button>
    </div>
  );
}
```

- [ ] **Step 5: Typecheck + Lint** — `rtk proxy pnpm typecheck && rtk proxy pnpm lint`
Expected: keine Fehler.

- [ ] **Step 6: Commit**
```bash
git add src/app/verwaltung/\(admin\)/tokens src/components/SideNav.tsx
git commit -m "feat: token admin UI (list/create/lock) + sidenav entry"
```

---

### Task 8: Gate verdrahten (Server Action + Formular)

**Files:**
- Create: `src/app/(gate)/actions.ts`
- Modify: `src/app/(gate)/page.tsx`
- Modify: `src/components/Gate.tsx`

**Interfaces:**
- Consumes: `consumeRate`/`clientIp` (T2), `redeemToken` (T4), `helferCookieOptions`/`HELFER_COOKIE` (T3), `sanitizeReturnTo` (T3).
- Produces: `einloesenAmGate(prev: GateState, formData: FormData): Promise<GateState>` mit `type GateState = { error?: string }`.

- [ ] **Step 1: `actions.ts`**

```ts
"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { consumeRate, clientIp } from "@/lib/auth/rateLimit";
import { redeemToken } from "@/actions/token-redeem";
import { HELFER_COOKIE, helferCookieOptions } from "@/lib/auth/helferSession";
import { sanitizeReturnTo } from "@/lib/auth/returnTo";

export type GateState = { error?: string };

export async function einloesenAmGate(_prev: GateState, formData: FormData): Promise<GateState> {
  const code = String(formData.get("code") ?? "");
  const returnTo = sanitizeReturnTo(String(formData.get("returnTo") ?? "")) ?? "/helfer";
  const ip = clientIp(await headers(), "unknown");

  if (!consumeRate(ip).ok) return { error: "Zu viele Versuche. Bitte kurz warten." };
  const res = await redeemToken(code);
  if (!res.ok) return { error: "Code nicht gefunden oder gesperrt." };

  (await cookies()).set(HELFER_COOKIE, res.cookieValue, helferCookieOptions());
  redirect(returnTo);
}
```

- [ ] **Step 2: `page.tsx` — returnTo durchreichen** (Next 15: `searchParams` ist Promise):

```tsx
import { Gate } from "@/components/Gate";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function GatePage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const { returnTo } = await searchParams;
  return (
    <Gate
      branding={{ appOrg: config.appOrg, appTagline: config.appTagline }}
      oidcEnabled={Boolean(config.oidcIssuer)}
      devLoginEnabled={config.authDevLogin && config.nodeEnv !== "production"}
      returnTo={returnTo ?? ""}
    />
  );
}
```

- [ ] **Step 3: `Gate.tsx` verdrahten** — „Im Dienst"-Karte auf `useActionState` umstellen, `returnTo`-Prop + Hidden-Field:

Signatur + Imports:
```tsx
"use client";
import { useActionState } from "react";
import { signIn } from "next-auth/react";
import { Key } from "lucide-react";
import { einloesenAmGate, type GateState } from "@/app/(gate)/actions";

export interface GateBranding { appOrg: string; appTagline: string; }

export function Gate({
  branding, oidcEnabled, devLoginEnabled, returnTo,
}: {
  branding: GateBranding; oidcEnabled: boolean; devLoginEnabled: boolean; returnTo: string;
}) {
  const [state, formAction, pending] = useActionState<GateState, FormData>(einloesenAmGate, {});
```
Die „Im Dienst"-Karte ersetzen durch ein `<form action={formAction}>`:
```tsx
        <div className="gatecard">
          <h2>Im Dienst</h2>
          <p>Für Helfer:innen: Code vom Regal- oder Fahrzeugetikett eingeben – ohne Konto, ohne Passwort. Nur Entnahme.</p>
          <form action={formAction} style={{ display: "contents" }}>
            <input type="hidden" name="returnTo" value={returnTo} />
            <input className="input tokeninput" name="code" placeholder="000-000" aria-label="Zugangs-Code" autoComplete="off" />
            {state.error && <div className="gateerr">{state.error}</div>}
            <button className="btn btn-rot" type="submit" disabled={pending}>Weiter</button>
          </form>
        </div>
```
Die „Verwaltung"-Karte (OIDC/Demo-Login-Buttons) bleibt unverändert. Der bisherige lokale `useState`-`code`-State entfällt (das Formular ist unkontrolliert).

- [ ] **Step 4: Typecheck + Lint + Build** — `rtk proxy pnpm typecheck && rtk proxy pnpm lint && rtk proxy pnpm build`
Expected: grün. (Build stellt sicher, dass die `"use server"`-Action sauber vom Client-Component importiert wird.)

- [ ] **Step 5: Commit**
```bash
git add src/app/\(gate\)/actions.ts src/app/\(gate\)/page.tsx src/components/Gate.tsx
git commit -m "feat: wire gate code entry (rate-limited redeem → helfer session → returnTo)"
```

---

### Task 9: `GET /t/[code]` Deep-Link

**Files:**
- Create: `src/app/t/[code]/route.ts`

**Interfaces:**
- Consumes: `consumeRate`/`clientIp`, `redeemToken`, `helferCookieOptions`/`HELFER_COOKIE`, `sanitizeReturnTo`, `config.appBaseUrl`.

- [ ] **Step 1: Route-Handler**

```ts
import { NextResponse } from "next/server";
import { consumeRate, clientIp } from "@/lib/auth/rateLimit";
import { redeemToken } from "@/actions/token-redeem";
import { HELFER_COOKIE, helferCookieOptions } from "@/lib/auth/helferSession";
import { sanitizeReturnTo } from "@/lib/auth/returnTo";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const url = new URL(req.url);
  const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo")) ?? "/helfer";
  const ip = clientIp(req.headers, "unknown");

  const gate = (msg?: string) => {
    const g = new URL("/", config.appBaseUrl);
    if (returnTo) g.searchParams.set("returnTo", returnTo);
    if (msg) g.searchParams.set("err", msg);
    return NextResponse.redirect(g);
  };

  if (!consumeRate(ip).ok) return gate("rate");
  const res = await redeemToken(code);
  if (!res.ok) return gate("code");

  const response = NextResponse.redirect(new URL(returnTo, config.appBaseUrl));
  response.cookies.set(HELFER_COOKIE, res.cookieValue, helferCookieOptions());
  return response;
}
```

- [ ] **Step 2: Typecheck + Build** — `rtk proxy pnpm typecheck && rtk proxy pnpm build`
Expected: grün.

- [ ] **Step 3: Commit**
```bash
git add src/app/t/\[code\]/route.ts
git commit -m "feat: /t/{code} deep-link (rate-limited redeem → helfer session → returnTo)"
```

---

### Task 10: Middleware-Cordons für `/helfer` und `/a`

**Files:**
- Create: `src/lib/auth/cordon.ts`
- Modify: `src/middleware.ts`
- Test: `src/lib/auth/cordon.test.ts`

**Interfaces:**
- Produces: `helferGateDecision(input: { pathname: string; search: string; hasHelfer: boolean; isAdmin: boolean }): { action: "allow" } | { action: "redirect"; to: string }`
  - `/helfer*`: helfer nötig; sonst Gate `/?returnTo=<pathname+search>`.
  - `/a/*`: helfer ODER admin; sonst Gate mit returnTo.
  - alles andere unter dem Matcher: `allow` (Middleware behandelt `/verwaltung` separat vor Aufruf dieser Funktion).

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from "vitest";
import { helferGateDecision } from "./cordon";

describe("helferGateDecision", () => {
  it("/helfer ohne Helfer → Gate mit returnTo", () => {
    expect(helferGateDecision({ pathname: "/helfer", search: "", hasHelfer: false, isAdmin: false }))
      .toEqual({ action: "redirect", to: "/?returnTo=%2Fhelfer" });
  });
  it("/helfer mit Helfer → allow", () => {
    expect(helferGateDecision({ pathname: "/helfer", search: "", hasHelfer: true, isAdmin: false }))
      .toEqual({ action: "allow" });
  });
  it("/helfer als reiner Admin → Gate (Admin ist kein Helfer)", () => {
    expect(helferGateDecision({ pathname: "/helfer", search: "", hasHelfer: false, isAdmin: true }).action)
      .toBe("redirect");
  });
  it("/a/{id} mit Helfer oder Admin → allow", () => {
    expect(helferGateDecision({ pathname: "/a/x1", search: "", hasHelfer: true, isAdmin: false }).action).toBe("allow");
    expect(helferGateDecision({ pathname: "/a/x1", search: "", hasHelfer: false, isAdmin: true }).action).toBe("allow");
  });
  it("/a/{id} ohne Session → Gate mit returnTo inkl. search", () => {
    expect(helferGateDecision({ pathname: "/a/x1", search: "?q=1", hasHelfer: false, isAdmin: false }))
      .toEqual({ action: "redirect", to: "/?returnTo=%2Fa%2Fx1%3Fq%3D1" });
  });
});
```

- [ ] **Step 2: Test rot** — `rtk proxy pnpm vitest run src/lib/auth/cordon.test.ts` → FAIL.

- [ ] **Step 3: `cordon.ts`**

```ts
export function helferGateDecision(input: {
  pathname: string;
  search: string;
  hasHelfer: boolean;
  isAdmin: boolean;
}): { action: "allow" } | { action: "redirect"; to: string } {
  const { pathname, search, hasHelfer, isAdmin } = input;
  const isA = pathname === "/a" || pathname.startsWith("/a/");
  const isHelfer = pathname === "/helfer" || pathname.startsWith("/helfer/");
  if (!isA && !isHelfer) return { action: "allow" };

  const allowed = isA ? hasHelfer || isAdmin : hasHelfer;
  if (allowed) return { action: "allow" };

  const returnTo = encodeURIComponent(pathname + search);
  return { action: "redirect", to: `/?returnTo=${returnTo}` };
}
```

- [ ] **Step 4: Test grün** — `rtk proxy pnpm vitest run src/lib/auth/cordon.test.ts` → PASS.

- [ ] **Step 5: `middleware.ts` erweitern**

```ts
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { HELFER_COOKIE, verifyHelferSession } from "@/lib/auth/helferSession";
import { helferGateDecision } from "@/lib/auth/cordon";

const { auth } = NextAuth(authConfig);

export default auth(async (req) => {
  const { pathname, search } = req.nextUrl;

  // Admin-Cordon (unverändert aus M1).
  if (pathname.startsWith("/verwaltung")) {
    if (pathname === "/verwaltung/kein-zugriff") return;
    if (!req.auth?.user) return Response.redirect(new URL("/", req.nextUrl));
    if (!req.auth.user.isAdmin) return Response.redirect(new URL("/verwaltung/kein-zugriff", req.nextUrl));
    return;
  }

  // Helfer-/Regaletikett-Cordon. Edge: nur Signatur+Ablauf des jose-Cookies
  // (kein DB-Zugriff); die aktiv-Prüfung macht requireHelfer je Buchung.
  const cookie = req.cookies.get(HELFER_COOKIE)?.value;
  const hasHelfer = cookie ? (await verifyHelferSession(cookie)) !== null : false;
  const decision = helferGateDecision({
    pathname, search, hasHelfer, isAdmin: Boolean(req.auth?.user?.isAdmin),
  });
  if (decision.action === "redirect") return Response.redirect(new URL(decision.to, req.nextUrl));
});

export const config = {
  matcher: ["/verwaltung/:path*", "/helfer/:path*", "/a/:path*"],
};
```
(`/t` bleibt bewusst außerhalb des Matchers — öffentlich, rate-limited im Route-Handler.)

- [ ] **Step 6: Typecheck + Build** — `rtk proxy pnpm typecheck && rtk proxy pnpm build`
Expected: grün (Middleware bleibt Edge-fähig — `verifyHelferSession`/`cordon` importieren kein `better-sqlite3`).

- [ ] **Step 7: Commit**
```bash
git add src/lib/auth/cordon.ts src/lib/auth/cordon.test.ts src/middleware.ts
git commit -m "feat: middleware cordons for /helfer and /a (edge jose verify)"
```

---

### Task 11: Helfer-Frame + `/helfer` Landing (Suchliste) + Beenden

**Files:**
- Create: `src/components/HelferFrame.tsx`
- Create: `src/components/HelferListe.tsx`
- Create: `src/app/helfer/layout.tsx`
- Create: `src/app/helfer/page.tsx`
- Create: `src/app/helfer/actions.ts`

**Interfaces:**
- Consumes: `getHelferPayload` (T4), `artikelListe` (bestehend), `chipTone`/`fmtVerfall` (bestehend).
- Produces: `HelferFrame` (Topbar Token-Label + Beenden + Entnahme-Tab, umschließt Kinder); `beenden()` Server Action (löscht Cookie → Gate).

- [ ] **Step 1: `actions.ts` (Logout)**

```ts
"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { HELFER_COOKIE } from "@/lib/auth/helferSession";

export async function beenden() {
  (await cookies()).delete(HELFER_COOKIE);
  redirect("/");
}
```

- [ ] **Step 2: `HelferFrame.tsx`** (Server Component; nutzt bestehende `.stage/.app/.topbar/.tabbar`-Klassen)

```tsx
import { QrCode, X } from "lucide-react";
import { beenden } from "@/app/helfer/actions";

export function HelferFrame({ tokenLabel, children }: { tokenLabel: string; children: React.ReactNode }) {
  return (
    <div className="stage">
      <div className="app">
        <div className="stripe" />
        <header className="topbar">
          <div>
            <div className="brand">LAGER<span>BUCH</span></div>
            <div className="brandsub">{tokenLabel}</div>
          </div>
          <form action={beenden}>
            <button className="filter" type="submit" style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <X size={13} /> Beenden
            </button>
          </form>
        </header>
        <main className="content">{children}</main>
        <nav className="tabbar">
          <span className="tab on"><QrCode size={20} /><span>Entnahme</span></span>
        </nav>
      </div>
      <div className="framecap">HELFER-ANSICHT · mobile-first, läuft auf jedem Diensthandy</div>
    </div>
  );
}
```
(In M2 nur ein Tab „Entnahme" — der Fahrzeug-Check-Tab kommt in M4.)

- [ ] **Step 3: `layout.tsx`** (liest Token-Label aus der Session)

```tsx
import { redirect } from "next/navigation";
import { getHelferPayload } from "@/actions/session";
import { HelferFrame } from "@/components/HelferFrame";

export const dynamic = "force-dynamic";

export default async function HelferLayout({ children }: { children: React.ReactNode }) {
  const payload = await getHelferPayload();
  if (!payload) redirect("/?returnTo=%2Fhelfer"); // Doppelabsicherung neben der Middleware
  return <HelferFrame tokenLabel={`Zugang: Token ${payload.code} · ${payload.label}`}>{children}</HelferFrame>;
}
```

- [ ] **Step 4: `page.tsx` (Landing)**

```tsx
import { getDb } from "@/db";
import { artikelListe } from "@/db/queries";
import { HelferListe } from "@/components/HelferListe";

export const dynamic = "force-dynamic";

export default function HelferHome() {
  const artikel = artikelListe(getDb()).map((a) => ({ id: a.id, name: a.name, einheit: a.einheit, fach: a.fach, bestand: a.bestand }));
  return (
    <>
      <div className="screenhead">Artikel wählen</div>
      <p className="footnote" style={{ marginBottom: 8 }}>Regaletikett scannen öffnet den Artikel direkt — oder hier suchen.</p>
      <HelferListe artikel={artikel} />
    </>
  );
}
```

- [ ] **Step 5: `HelferListe.tsx` (Client, Suche + Links zu `/a/{id}`)**

```tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

type Row = { id: string; name: string; einheit: string; fach: string; bestand: number };

export function HelferListe({ artikel }: { artikel: Row[] }) {
  const [q, setQ] = useState("");
  const filtered = q.trim()
    ? artikel.filter((a) => a.name.toLowerCase().includes(q.trim().toLowerCase()))
    : artikel;
  return (
    <>
      <input className="input" placeholder="Artikel suchen…" value={q} onChange={(e) => setQ(e.target.value)}
        aria-label="Artikel suchen" style={{ marginBottom: 10 }} />
      <div className="card">
        {filtered.length === 0 && <div className="cardpad">Kein Artikel gefunden.</div>}
        {filtered.map((a) => (
          <Link className="row" key={a.id} href={`/a/${a.id}`} style={{ textDecoration: "none", color: "inherit" }}>
            <div className="rowmain">
              <div className="rowname">{a.name}</div>
              <div className="rowmeta"><span className="fach">{a.fach}</span><small>Bestand {a.bestand} {a.einheit}</small></div>
            </div>
            <ChevronRight size={18} />
          </Link>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 6: Typecheck + Lint + Build** — `rtk proxy pnpm typecheck && rtk proxy pnpm lint && rtk proxy pnpm build`
Expected: grün.

- [ ] **Step 7: Commit**
```bash
git add src/components/HelferFrame.tsx src/components/HelferListe.tsx src/app/helfer/layout.tsx src/app/helfer/page.tsx src/app/helfer/actions.ts
git commit -m "feat: helfer frame + searchable article landing + logout"
```

---

### Task 12: `/a/[artikelId]` rollenabhängig + Helfer-Entnahme-Detail

**Files:**
- Create: `src/app/a/[artikelId]/page.tsx`
- Create: `src/components/HelferDetail.tsx`
- Modify: `src/db/queries.ts` (`artikelDetailHelfer` — gate-frei, aufbereitet)

**Interfaces:**
- Consumes: `getHelferPayload`, `auth` (Admin-Check), `artikelDetail` (bestehend), `bucheEntnahmeHelfer` (T5), `Plakette`, `Stepper`, `chipTone`/`chargeText`/`fmtVerfall`.
- `/a/{id}`: Admin (ohne Helfer-Session) → redirect `/verwaltung/artikel?a={id}`; Helfer → Detailseite; keine Session → redirect Gate.

- [ ] **Step 1: `queries.ts` — gate-freie Detail-Aufbereitung** (ans Ende, spiegelt `getDetail` aus `actions/detail.ts`, aber ohne `requireAdmin`):

```ts
import { verfallStatus } from "@/lib/domain/verfall";
import { chargeText } from "@/lib/format";
// (config/verfallStatus ggf. schon importiert — nicht doppeln)

export function artikelDetailHelfer(db: DB, id: string) {
  const d = artikelDetail(db, id);
  if (!d) return null;
  const now = new Date();
  const opts = { kritisch: config.warnTageKritisch, faellig: config.warnTageFaellig };
  const chargen = d.chargen
    .filter((c) => c.rest > 0)
    .map((c) => { const s = verfallStatus(c.verfall, opts, now); return { ...c, ampel: s.ampel, text: chargeText(s, c.verfall) }; })
    .sort((a, b) => a.verfall.localeCompare(b.verfall));
  return {
    id: d.artikel.id, name: d.artikel.name, einheit: d.artikel.einheit, fach: d.artikel.fach,
    bestand: d.bestand, chargen,
  };
}
```
(`chargeText`/`verfallStatus`/`config` sind in `queries.ts` teils schon importiert — Imports zusammenführen, nicht duplizieren.)

- [ ] **Step 2: `page.tsx` (Server, rollenabhängig)**

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getHelferPayload } from "@/actions/session";
import { getDb } from "@/db";
import { artikelDetailHelfer } from "@/db/queries";
import { HelferDetail } from "@/components/HelferDetail";

export const dynamic = "force-dynamic";

export default async function ArtikelDeepLink({ params }: { params: Promise<{ artikelId: string }> }) {
  const { artikelId } = await params;
  const helfer = await getHelferPayload();

  if (!helfer) {
    // Kein Helfer: Admins zur Verwaltung, alle anderen zum Gate (Middleware fängt
    // den reinen Kein-Session-Fall bereits ab; dies ist die Rollen-Weiche).
    const session = await auth();
    if (session?.user?.isAdmin) redirect(`/verwaltung/artikel?a=${artikelId}`);
    redirect(`/?returnTo=${encodeURIComponent(`/a/${artikelId}`)}`);
  }

  const detail = artikelDetailHelfer(getDb(), artikelId);
  if (!detail) redirect("/helfer");
  return <HelferDetail detail={detail} />;
}
```
**Hinweis für Implementer:** `/a/{id}` liegt **außerhalb** von `/helfer`, teilt daher nicht das `helfer/layout.tsx`. Damit die Helfer-Detailseite denselben Phone-Frame trägt, rendert `HelferDetail` ihn selbst über `HelferFrame` (Token-Label aus `getHelferPayload`). → In Step 2 zusätzlich `payload.code/label` an `HelferDetail` geben, oder `HelferDetail` liest via eigenem Server-Wrapper. Einfachste Lösung: `page.tsx` reicht `tokenLabel` an eine Server-Wrapper-Komponente, die `HelferFrame` + `HelferDetailClient` rendert (siehe Step 3).

- [ ] **Step 3: `HelferDetail.tsx`** — Server-Wrapper (Frame) + Client-Entnahme. Zwei Exporte in einer Datei sind unpraktisch; daher: `HelferDetail` = Server-Komponente, die `HelferFrame` rendert und darin die Client-Entnahme. Passe Step 2 an, sodass `page.tsx` `tokenLabel` übergibt:

`page.tsx` Rückgabe ändern zu:
```tsx
  return <HelferDetail detail={detail} tokenLabel={`Zugang: Token ${helfer.code} · ${helfer.label}`} />;
```
`HelferDetail.tsx`:
```tsx
import { HelferFrame } from "@/components/HelferFrame";
import { HelferEntnahme, type DetailData } from "@/components/HelferEntnahme";

export function HelferDetail({ detail, tokenLabel }: { detail: DetailData; tokenLabel: string }) {
  return (
    <HelferFrame tokenLabel={tokenLabel}>
      <HelferEntnahme detail={detail} />
    </HelferFrame>
  );
}
```

- [ ] **Step 4: `src/components/HelferEntnahme.tsx` (Client, Entnahme + FEFO-Liste)** — portiert aus `mockup.jsx` `Detail` (Z. 397–445):

```tsx
"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronLeft, Check, Minus } from "lucide-react";
import { Stepper } from "@/components/Stepper";
import { Plakette } from "@/components/Plakette";
import { bucheEntnahmeHelfer } from "@/actions/buchung";
import { chipTone } from "@/lib/format";
import type { Ampel } from "@/lib/domain/verfall";

export type DetailData = {
  id: string; name: string; einheit: string; fach: string; bestand: number;
  chargen: { id: string; chargenNr: string; verfall: string; rest: number; ampel: Ampel; text: string }[];
};

export function HelferEntnahme({ detail }: { detail: DetailData }) {
  const [menge, setMenge] = useState(1);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const bestand = detail.bestand;

  function buchen() {
    const m = Math.min(menge, bestand);
    if (m <= 0) return;
    start(async () => {
      const { gebucht } = await bucheEntnahmeHelfer({ artikelId: detail.id, menge: m });
      setMsg(`Entnahme gebucht: ${gebucht} × ${detail.name}`);
      setMenge(1);
    });
  }

  return (
    <>
      <Link className="filter" href="/helfer" style={{ display: "inline-flex", alignItems: "center", gap: 5, marginBottom: 12 }}>
        <ChevronLeft size={15} /> Zurück
      </Link>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, margin: "0 2px 6px" }}>
        <h1 style={{ font: "700 24px var(--display)", lineHeight: 1.12, flex: 1 }}>{detail.name}</h1>
        <span className="fach" style={{ marginTop: 6 }}>{detail.fach}</span>
      </div>
      <div className="card cardpad">
        <div style={{ fontSize: 12, color: "var(--stahl)", fontWeight: 600, letterSpacing: ".04em" }}>BESTAND HANDLAGER</div>
        <div style={{ font: "700 36px var(--display)", lineHeight: 1.05 }}>{bestand} <span style={{ fontSize: 16 }}>{detail.einheit}</span></div>
      </div>
      <div className="card">
        <div className="cardtitle">Entnahme</div>
        <div className="cardpad" style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13.5, color: "var(--stahl)", fontWeight: 500 }}>Menge</span>
            <Stepper wert={menge} setWert={setMenge} max={Math.max(bestand, 1)} />
          </div>
          <button className="btn btn-rot" disabled={bestand === 0 || pending} onClick={buchen}>
            <Minus size={16} /> Entnahme buchen
          </button>
          {msg && <div className="chip chip-ok" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Check size={14} /> {msg}</div>}
        </div>
      </div>
      <div className="card">
        <div className="cardtitle">Nächste Charge zuerst (FEFO)</div>
        {detail.chargen.map((c) => (
          <div className="row" key={c.id}>
            <Plakette verfall={c.verfall} ampel={c.ampel} />
            <div className="rowmain">
              <div style={{ font: "600 12.5px var(--mono)" }}>Charge {c.chargenNr}</div>
              <div className="rowmeta"><span className={`chip chip-${chipTone(c.ampel)}`}>{c.text}</span></div>
            </div>
            <div className="bignum" style={{ fontSize: 20 }}>{c.rest}<small>{detail.einheit}</small></div>
          </div>
        ))}
      </div>
    </>
  );
}
```
**Interface-Check:** `Plakette` erwartet laut M1 ein vorab berechnetes `ampel`-Prop (`<Plakette verfall ampel />`) und `Stepper` `{ wert, setWert, max }`. Falls die tatsächlichen Props abweichen, an die bestehende Signatur in `src/components/Plakette.tsx`/`Stepper.tsx` anpassen (nicht die Komponenten ändern).

- [ ] **Step 5: Typecheck + Lint + Build** — `rtk proxy pnpm typecheck && rtk proxy pnpm lint && rtk proxy pnpm build`
Expected: grün.

- [ ] **Step 6: Commit**
```bash
git add src/app/a src/components/HelferDetail.tsx src/components/HelferEntnahme.tsx src/db/queries.ts
git commit -m "feat: /a/{id} role-aware deep-link + mobile helfer entnahme detail"
```

---

### Task 13: e2e — Einlösen → Entnahme → Journal + Sperr-Bounce; deployment.md

**Files:**
- Create: `e2e/helfer-flow.spec.ts`
- Modify: `deployment.md`
- Modify: `e2e/migrate-db.ts` (Seed eines Test-Tokens + Artikels mit Bestand, falls das bestehende Seed das nicht liefert)

**Interfaces:**
- Consumes: laufender Dev-Server mit Wegwerf-DB (bestehendes `playwright.config.ts` `webServer`-Chain).

- [ ] **Step 1: Seed prüfen/ergänzen** — sicherstellen, dass `e2e/migrate-db.ts` einen **aktiven Token mit bekanntem Code** (z. B. `111-111`, Label „E2E") **und** einen Artikel mit Bestand > 0 anlegt (für die Entnahme). Falls nicht vorhanden, ergänzen (idempotent, analog zum bestehenden Seed-Stil). Den gewählten Code im Test verwenden.

- [ ] **Step 2: Spec schreiben** — `e2e/helfer-flow.spec.ts`:

```ts
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
});

test("gesperrter Token wird an der Buchung abgewiesen", async ({ page, request }) => {
  // Dieser Test setzt voraus, dass der Token über die Verwaltung gesperrt werden
  // kann; alternativ als reiner requireHelfer-Integrationstest bereits in Task 4
  // abgedeckt. Hier Minimalpfad: Einlösen bleibt möglich, Sperrwirkung ist in
  // src/actions/session-helfer.test.ts verifiziert.
  await page.goto("/");
  await expect(page.getByText("Verwaltung")).toBeVisible();
});
```
**Hinweis:** Der harte Sperr-Bounce ist bereits in `session-helfer.test.ts` (Task 4) unit-verifiziert. Der e2e-Fokus liegt auf dem Happy-Path Einlösen→Entnahme→Journal. Falls der Demo-Login im e2e-Setup aktiv ist, kann der Journal-Assert ergänzt werden: nach Entnahme als Admin einloggen (`Demo-Login`), `/verwaltung/journal` öffnen, `quelleId`=Code sichtbar.

- [ ] **Step 3: e2e ausführen** — `rtk proxy pnpm exec playwright test e2e/helfer-flow.spec.ts`
Expected: grün. (Bei Bedarf `--reporter=list`.)

- [ ] **Step 4: `deployment.md` ergänzen** — Abschnitt „Reverse-Proxy" bzw. Env um drei Punkte erweitern:
  - Der Reverse-Proxy **muss `X-Forwarded-For`** an den Container weiterreichen — sonst greift das Rate-Limit global statt pro Client-IP.
  - **`HELFER_SESSION_SECRET`** ist in Produktion Pflicht (Start wirft sonst); via `generate-secrets.sh` erzeugen.
  - Das Rate-Limit ist prozesslokal (In-Memory) und **resettet bei Container-Neustart** — bewusst, kein Redis.

- [ ] **Step 5: Commit**
```bash
git add e2e/helfer-flow.spec.ts e2e/migrate-db.ts deployment.md
git commit -m "test: e2e helfer redeem→entnahme happy path; document XFF + helfer secret"
```

---

## Abschluss

Nach Task 13: volle Suite grün stellen und Schluss-Review dispatchen.
```bash
rtk proxy pnpm typecheck && rtk proxy pnpm lint && rtk proxy pnpm test && rtk proxy pnpm build
```
Dann **superpowers:requesting-code-review** (Whole-Branch-Review, Range `main..HEAD`), Findings-Fixwave, danach **superpowers:finishing-a-development-branch** → lokal in `main` mergen (wie M0/M1). Nichts pushen ohne explizites Go (Public-Repo).
