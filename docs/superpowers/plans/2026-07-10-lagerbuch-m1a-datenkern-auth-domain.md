# Lagerbuch M1a — Datenkern + Auth + Domain-Logik Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The data layer (Drizzle/SQLite schema, migrations, append-only triggers, PRAGMAs, startup migration), the verified pure domain functions (FEFO / Bestand / Verfall / Vorschlag), and authentication (Auth.js v5 OIDC + a dev-only demo login) — so an admin can log in locally (demo login) and land in an empty Verwaltung shell, with all domain rules unit-tested and the journal proven append-only.

**Architecture:** One SQLite file via Drizzle + better-sqlite3 (synchronous driver). Bestand is never stored — it is always `SUM(buchungen.menge)`. The journal is append-only, enforced by SQLite triggers (`RAISE(ABORT,…)` on UPDATE/DELETE). Domain rules live as pure functions in `src/lib/domain/` operating on plain data (no DB import), so they are trivially unit-testable. Auth.js v5 (JWT sessions, no DB adapter) uses a generic OIDC provider against Pocket ID in production plus a Credentials "demo login" provider that is registered ONLY when `AUTH_DEV_LOGIN=true` AND `NODE_ENV !== "production"` (a zod env refinement makes that combination impossible in production).

**Tech Stack:** Drizzle ORM + better-sqlite3 + drizzle-kit · nanoid (ids) · Auth.js v5 (`next-auth@beta`) · zod · Vitest (unit + integration against `:memory:`) · Next.js 15 App Router (existing M0 base).

## Global Constraints

- **Builds on M0** (already on `main`): Next 15/React 19/TS strict, pnpm+mise (Node 24), config in `src/lib/config.ts` (zod, throws at startup), `@/* → ./src/*`. Run tests with `pnpm test` (use `rtk proxy pnpm test`/`rtk proxy pnpm lint` if the shell RTK hook mangles output).
- **Data model (verbatim from the design spec §5):** tables `lagerorte`, `artikel` (+ `bestelltAt` nullable), `chargen`, `buchungen`, `soll_positionen`, `tokens`, `checks`, `users`. IDs are `text` primary keys generated with **nanoid**. Timestamps stored as `integer({mode:"timestamp"})`; `verfall` as `text` `"YYYY-MM"`. Indices: `buchungen(artikel_id)`, `buchungen(charge_id)`, `buchungen(ts)`, `chargen(artikel_id, verfall)`, `soll_positionen(fahrzeug_id)`.
- **Append-only journal:** triggers block `UPDATE`/`DELETE` on `buchungen` with `RAISE(ABORT, 'journal ist append-only')`. Corrections are new `korrektur` rows.
- **PRAGMAs at connect:** `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`, `synchronous=NORMAL`.
- **Domain rules (design spec §6 / plan §7)** — the pure functions must implement exactly:
  - Bestand = `SUM(menge)`; charge Bestand = `SUM(menge) WHERE charge_id`.
  - FEFO entnahme: distribute over chargen with rest>0 ascending by `verfall`; one row per affected charge; total capped at available Bestand; return actually-booked amount.
  - Verfall-Ampel: expiry = last day of the `verfall` month; `resttage ≤ WARN_TAGE_KRITISCH` → rot, `≤ WARN_TAGE_FAELLIG` → gelb, else grün; already-expired → rot.
  - Bestellvorschlag: Bestand < Mindestbestand → menge = `BESTELL_FAKTOR × Mindestbestand − Bestand`.
- **Auth:** Auth.js v5, JWT session. Prod = generic OIDC provider (Pocket ID); group claim `OIDC_ADMIN_GROUP` required (else friendly "kein Zugriff"). **Dev demo login:** a Credentials provider registered only when `AUTH_DEV_LOGIN === "true"` AND `NODE_ENV !== "production"`; the zod env schema THROWS if `AUTH_DEV_LOGIN=true` while `NODE_ENV=production`. Config gains `AUTH_SECRET`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_ADMIN_GROUP` (default `lagerbuch-admin`), `AUTH_DEV_LOGIN` (default false).
- **Privacy:** public repo — no personal data; placeholders only.
- **Commits:** frequent, one per task, do NOT push. Trailer:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_014kZuFZYQZXBQN7VXP82hc2
  ```

---

## File Structure

| Path | Responsibility | Task |
|---|---|---|
| `package.json` | add drizzle-orm, better-sqlite3, drizzle-kit, @types/better-sqlite3, nanoid, next-auth@beta | 1 |
| `drizzle.config.ts` | drizzle-kit config (sqlite dialect, schema path, out) | 1 |
| `src/db/schema.ts` | all 8 tables + indices | 1 |
| `src/db/index.ts` | better-sqlite3 connection + PRAGMAs + `db` export + `applyMigrations()` | 2 |
| `drizzle/` | generated migrations (checked in) + custom trigger migration | 2, 3 |
| `src/db/testing.ts` | `createTestDb()` — in-memory db with migrations + triggers applied | 3 |
| `src/lib/domain/bestand.ts` (+ test) | Bestand aggregation | 4 |
| `src/lib/domain/verfall.ts` (+ test) | Verfall-Ampel | 5 |
| `src/lib/domain/fefo.ts` (+ test) | FEFO distribution | 6 |
| `src/lib/domain/vorschlag.ts` (+ test) | Bestellvorschlag | 7 |
| `src/lib/config.ts` (+ test) | extend with auth/OIDC env + dev-login refinement | 8 |
| `src/auth.config.ts` | Edge-safe Auth config: providers + callbacks (NO db import) | 9 |
| `src/auth.ts` | Node Auth: `NextAuth()` + DB user-upsert event; exports handlers/auth/signIn/signOut | 9 |
| `src/app/api/auth/[...nextauth]/route.ts` | Auth.js route handler | 9 |
| `middleware.ts` | protect `/verwaltung/*` (edge-safe auth from `auth.config`) | 10 |
| `src/app/verwaltung/layout.tsx`, `page.tsx`, `kein-zugriff/page.tsx` | Verwaltung shell + no-access page | 10 |
| `src/components/Gate.tsx` | wire OIDC sign-in + (dev) demo-login buttons | 10 |
| `instrumentation.ts` | run migrations on server start | 11 |

---

## Task 1: Drizzle setup + schema

**Files:**
- Modify: `package.json`
- Create: `drizzle.config.ts`, `src/db/schema.ts`

**Interfaces:**
- Produces: exported Drizzle table objects (`lagerorte`, `artikel`, `chargen`, `buchungen`, `sollPositionen`, `tokens`, `checks`, `users`) from `@/db/schema`, and a `newId()` helper.

- [ ] **Step 1: Add dependencies**

Run:
```bash
cd /Users/rubeen/dev/personal/drk/lagerbuch
pnpm add drizzle-orm better-sqlite3 nanoid next-auth@beta
pnpm add -D drizzle-kit @types/better-sqlite3
```
Expected: installs succeed; `next-auth` resolves to a `5.x` beta.

- [ ] **Step 2: Write `drizzle.config.ts`**

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: "./.data/dev.db" },
});
```

- [ ] **Step 3: Write `src/db/schema.ts`**

```ts
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";

export const newId = () => nanoid();

export const lagerorte = sqliteTable("lagerorte", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  typ: text("typ", { enum: ["lager", "fahrzeug"] }).notNull(),
  kennung: text("kennung"),
  aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
});

export const artikel = sqliteTable("artikel", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  einheit: text("einheit").notNull(),
  fach: text("fach").notNull(),
  mindestbestand: integer("mindestbestand").notNull().default(0),
  aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
  bestelltAt: integer("bestellt_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const chargen = sqliteTable(
  "chargen",
  {
    id: text("id").primaryKey(),
    artikelId: text("artikel_id").notNull().references(() => artikel.id),
    chargenNr: text("chargen_nr").notNull(),
    verfall: text("verfall").notNull(), // "YYYY-MM"
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("idx_chargen_artikel_verfall").on(t.artikelId, t.verfall)],
);

export const buchungen = sqliteTable(
  "buchungen",
  {
    id: text("id").primaryKey(),
    ts: integer("ts", { mode: "timestamp" }).notNull(),
    typ: text("typ", { enum: ["zugang", "entnahme", "korrektur"] }).notNull(),
    artikelId: text("artikel_id").notNull().references(() => artikel.id),
    chargeId: text("charge_id").notNull().references(() => chargen.id),
    lagerortId: text("lagerort_id").notNull().references(() => lagerorte.id),
    menge: integer("menge").notNull(), // signed: zugang +, entnahme −
    quelleTyp: text("quelle_typ", { enum: ["token", "oidc", "system"] }).notNull(),
    quelleId: text("quelle_id").notNull(),
    referenz: text("referenz"),
    kommentar: text("kommentar"),
  },
  (t) => [
    index("idx_buchungen_artikel").on(t.artikelId),
    index("idx_buchungen_charge").on(t.chargeId),
    index("idx_buchungen_ts").on(t.ts),
  ],
);

export const sollPositionen = sqliteTable(
  "soll_positionen",
  {
    id: text("id").primaryKey(),
    fahrzeugId: text("fahrzeug_id").notNull().references(() => lagerorte.id),
    fachLabel: text("fach_label").notNull(),
    sort: integer("sort").notNull().default(0),
    artikelId: text("artikel_id").notNull().references(() => artikel.id),
    soll: integer("soll").notNull(),
  },
  (t) => [index("idx_soll_fahrzeug").on(t.fahrzeugId)],
);

export const tokens = sqliteTable("tokens", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  label: text("label").notNull(),
  scopeLagerortId: text("scope_lagerort_id").references(() => lagerorte.id),
  aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  createdBy: text("created_by").notNull(),
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
});

export const checks = sqliteTable("checks", {
  id: text("id").primaryKey(),
  fahrzeugId: text("fahrzeug_id").notNull().references(() => lagerorte.id),
  quelleTyp: text("quelle_typ").notNull(),
  quelleId: text("quelle_id").notNull(),
  startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  ergebnis: text("ergebnis"),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(), // OIDC sub
  name: text("name"),
  email: text("email"),
  lastLoginAt: integer("last_login_at", { mode: "timestamp" }),
});
```

- [ ] **Step 4: Generate the first migration**

Run:
```bash
mkdir -p .data
pnpm exec drizzle-kit generate
```
Expected: a `drizzle/0000_*.sql` migration + `drizzle/meta/` created. Confirm the SQL contains all 8 `CREATE TABLE`s and the indices.

- [ ] **Step 5: Add `.data/` to .gitignore**

Append `/.data/` to `.gitignore` (local dev DB scratch). The `drizzle/` folder IS committed.

- [ ] **Step 6: Typecheck & commit**

```bash
rtk proxy pnpm typecheck
git add -A
git commit -m "feat: add drizzle schema, config, and initial migration"
```
Expected: typecheck clean; commit includes `drizzle/0000_*`.

---

## Task 2: DB connection module + PRAGMAs + startup migration

**Files:**
- Create: `src/db/index.ts`

**Interfaces:**
- Consumes: `@/db/schema`, `@/lib/config` (`config.databasePath`).
- Produces: `db` (Drizzle instance, lazily opened on the file DB with PRAGMAs), `getSqlite()` (raw better-sqlite3 handle), `applyMigrations(database)` that runs `migrate(...)` against a given Drizzle instance from `./drizzle`.

- [ ] **Step 1: Write `src/db/index.ts`**

```ts
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "@/lib/config";
import * as schema from "@/db/schema";

export type DB = BetterSQLite3Database<typeof schema>;

function openDatabase(path: string): Database.Database {
  if (path !== ":memory:") {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");
  return sqlite;
}

let _sqlite: Database.Database | undefined;
let _db: DB | undefined;

export function getSqlite(): Database.Database {
  if (!_sqlite) _sqlite = openDatabase(config.databasePath);
  return _sqlite;
}

export function getDb(): DB {
  if (!_db) _db = drizzle(getSqlite(), { schema });
  return _db;
}

export const MIGRATIONS_FOLDER = "./drizzle";

export function applyMigrations(database: DB): void {
  migrate(database, { migrationsFolder: MIGRATIONS_FOLDER });
}
```

- [ ] **Step 2: Typecheck & commit**

```bash
rtk proxy pnpm typecheck
git add -A
git commit -m "feat: add db connection module with WAL PRAGMAs and migrator"
```

---

## Task 3: Append-only triggers (custom migration) + test harness

**Files:**
- Create: `drizzle/0001_*_append_only.sql` (custom), `src/db/testing.ts`, `src/db/append-only.test.ts`

**Interfaces:**
- Produces: `createTestDb(): DB` — an in-memory Drizzle db with all migrations (incl. triggers) applied; used by every integration test.

- [ ] **Step 1: Generate an empty custom migration and fill in the triggers**

Run:
```bash
pnpm exec drizzle-kit generate --custom --name append_only
```
This creates an empty `drizzle/0001_append_only.sql`. Fill it with:
```sql
CREATE TRIGGER buchungen_no_update
BEFORE UPDATE ON buchungen
BEGIN
  SELECT RAISE(ABORT, 'journal ist append-only');
END;
--> statement-breakpoint
CREATE TRIGGER buchungen_no_delete
BEFORE DELETE ON buchungen
BEGIN
  SELECT RAISE(ABORT, 'journal ist append-only');
END;
```

- [ ] **Step 2: Write the test harness `src/db/testing.ts`**

```ts
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "@/db/schema";
import type { DB } from "@/db";

export function createTestDb(): DB {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}
```

- [ ] **Step 3: Write the failing integration test `src/db/append-only.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/testing";
import { artikel, chargen, lagerorte, buchungen, newId } from "@/db/schema";

function seedOneBuchung(db = createTestDb()) {
  const now = new Date();
  const lagerId = newId();
  const artId = newId();
  const chId = newId();
  const buId = newId();
  db.insert(lagerorte).values({ id: lagerId, name: "Handlager", typ: "lager" }).run();
  db.insert(artikel).values({ id: artId, name: "Mullbinde", einheit: "Stk.", fach: "A2", mindestbestand: 10, createdAt: now }).run();
  db.insert(chargen).values({ id: chId, artikelId: artId, chargenNr: "X-1", verfall: "2028-06", createdAt: now }).run();
  db.insert(buchungen).values({ id: buId, ts: now, typ: "zugang", artikelId: artId, chargeId: chId, lagerortId: lagerId, menge: 5, quelleTyp: "system", quelleId: "seed" }).run();
  return { db, buId };
}

describe("append-only journal", () => {
  it("allows inserts", () => {
    const { db } = seedOneBuchung();
    expect(db.select().from(buchungen).all()).toHaveLength(1);
  });

  it("blocks UPDATE on buchungen", () => {
    const { db, buId } = seedOneBuchung();
    expect(() =>
      db.update(buchungen).set({ menge: 99 }).where(eq(buchungen.id, buId)).run(),
    ).toThrow(/append-only/);
  });

  it("blocks DELETE on buchungen", () => {
    const { db, buId } = seedOneBuchung();
    expect(() =>
      db.delete(buchungen).where(eq(buchungen.id, buId)).run(),
    ).toThrow(/append-only/);
  });
});
```

- [ ] **Step 4: Run — RED then GREEN**

Run: `rtk proxy pnpm test src/db/append-only.test.ts`
Expected: after Step 1–2 in place, GREEN (3 pass). If the trigger migration is missing, the UPDATE/DELETE tests FAIL (no throw) — that is the RED signal that the trigger SQL isn't applied.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add append-only triggers migration and in-memory test harness"
```

---

## Task 4: Domain — Bestand

**Files:**
- Create: `src/lib/domain/bestand.ts`, `src/lib/domain/bestand.test.ts`

**Interfaces:**
- Produces:
  - `bestand(rows: { menge: number }[]): number` — sum of `menge`.
  - `bestandProCharge(rows: { chargeId: string; menge: number }[]): Map<string, number>`.

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from "vitest";
import { bestand, bestandProCharge } from "./bestand";

describe("bestand", () => {
  it("sums signed menge (zugang + / entnahme −)", () => {
    expect(bestand([{ menge: 10 }, { menge: -3 }, { menge: 2 }])).toBe(9);
  });
  it("is 0 for no rows", () => {
    expect(bestand([])).toBe(0);
  });
  it("aggregates per charge", () => {
    const m = bestandProCharge([
      { chargeId: "a", menge: 5 },
      { chargeId: "a", menge: -2 },
      { chargeId: "b", menge: 4 },
    ]);
    expect(m.get("a")).toBe(3);
    expect(m.get("b")).toBe(4);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `rtk proxy pnpm test src/lib/domain/bestand.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `src/lib/domain/bestand.ts`**

```ts
export function bestand(rows: { menge: number }[]): number {
  return rows.reduce((sum, r) => sum + r.menge, 0);
}

export function bestandProCharge(
  rows: { chargeId: string; menge: number }[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.chargeId, (m.get(r.chargeId) ?? 0) + r.menge);
  return m;
}
```

- [ ] **Step 4: Run to verify it passes** — `rtk proxy pnpm test src/lib/domain/bestand.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add bestand domain function with tests"
```

---

## Task 5: Domain — Verfall-Ampel

**Files:**
- Create: `src/lib/domain/verfall.ts`, `src/lib/domain/verfall.test.ts`

**Interfaces:**
- Produces:
  - `type Ampel = "rot" | "gelb" | "gruen"`
  - `verfallStatus(verfall: string, opts: { kritisch: number; faellig: number }, now: Date): { ampel: Ampel; tage: number; abgelaufen: boolean }`
  - Expiry = last day of the `YYYY-MM` month (23:59:59). `tage` = whole days from `now` to expiry (can be negative). `abgelaufen` = expiry < now.

- [ ] **Step 1: Failing test** (fixed `now` for determinism)

```ts
import { describe, expect, it } from "vitest";
import { verfallStatus } from "./verfall";

const opts = { kritisch: 31, faellig: 56 };
const now = new Date("2026-07-10T12:00:00Z");

describe("verfallStatus", () => {
  it("green when far in the future", () => {
    expect(verfallStatus("2027-01", opts, now).ampel).toBe("gruen");
  });
  it("yellow inside the faellig window (≤56d, >31d)", () => {
    // 2026-08 expires 2026-08-31 → ~52 days out
    const s = verfallStatus("2026-08", opts, now);
    expect(s.ampel).toBe("gelb");
  });
  it("red inside the kritisch window (≤31d)", () => {
    // 2026-07 expires 2026-07-31 → ~21 days out
    expect(verfallStatus("2026-07", opts, now).ampel).toBe("rot");
  });
  it("red and abgelaufen when the month already ended", () => {
    const s = verfallStatus("2026-06", opts, now); // expired 2026-06-30
    expect(s.ampel).toBe("rot");
    expect(s.abgelaufen).toBe(true);
    expect(s.tage).toBeLessThan(0);
  });
  it("handles a leap-year February end", () => {
    // 2028-02 expires 2028-02-29
    const s = verfallStatus("2028-02", opts, new Date("2028-02-01T00:00:00Z"));
    expect(s.tage).toBeGreaterThanOrEqual(28);
  });
});
```

- [ ] **Step 2: Run to verify it fails** → FAIL (module missing).

- [ ] **Step 3: Implement `src/lib/domain/verfall.ts`**

```ts
export type Ampel = "rot" | "gelb" | "gruen";

export function verfallStatus(
  verfall: string,
  opts: { kritisch: number; faellig: number },
  now: Date,
): { ampel: Ampel; tage: number; abgelaufen: boolean } {
  const [y, m] = verfall.split("-").map(Number);
  // Day 0 of the next month = last day of this month; end-of-day.
  const ende = new Date(y, m, 0, 23, 59, 59, 999);
  const tage = Math.ceil((ende.getTime() - now.getTime()) / 86_400_000);
  const abgelaufen = ende.getTime() < now.getTime();
  let ampel: Ampel;
  if (tage <= opts.kritisch) ampel = "rot";
  else if (tage <= opts.faellig) ampel = "gelb";
  else ampel = "gruen";
  return { ampel, tage, abgelaufen };
}
```

- [ ] **Step 4: Run to verify it passes** → PASS.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: add verfall ampel domain function with boundary tests"`

---

## Task 6: Domain — FEFO distribution

**Files:**
- Create: `src/lib/domain/fefo.ts`, `src/lib/domain/fefo.test.ts`

**Interfaces:**
- Produces:
  - `type ChargeRest = { chargeId: string; verfall: string; rest: number }`
  - `fefoVerteilung(chargen: ChargeRest[], menge: number): { chargeId: string; menge: number }[]`
  - Distributes a positive `menge` (entnahme amount) across chargen with `rest > 0`, ascending by `verfall`; each returned `menge` is the positive amount taken from that charge; the total equals `min(menge, sum of rest)` (server-side capping). Chargen with `rest ≤ 0` are skipped; chargen contributing 0 are omitted.

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from "vitest";
import { fefoVerteilung } from "./fefo";

describe("fefoVerteilung", () => {
  it("takes from the earliest-expiring charge first", () => {
    const r = fefoVerteilung(
      [
        { chargeId: "late", verfall: "2028-01", rest: 10 },
        { chargeId: "early", verfall: "2026-08", rest: 10 },
      ],
      4,
    );
    expect(r).toEqual([{ chargeId: "early", menge: 4 }]);
  });
  it("splits across chargen when one is not enough", () => {
    const r = fefoVerteilung(
      [
        { chargeId: "a", verfall: "2026-08", rest: 3 },
        { chargeId: "b", verfall: "2027-01", rest: 10 },
      ],
      5,
    );
    expect(r).toEqual([
      { chargeId: "a", menge: 3 },
      { chargeId: "b", menge: 2 },
    ]);
  });
  it("caps at total available rest", () => {
    const r = fefoVerteilung([{ chargeId: "a", verfall: "2026-08", rest: 3 }], 99);
    expect(r).toEqual([{ chargeId: "a", menge: 3 }]);
  });
  it("skips empty chargen and omits zero contributions", () => {
    const r = fefoVerteilung(
      [
        { chargeId: "empty", verfall: "2026-01", rest: 0 },
        { chargeId: "a", verfall: "2026-08", rest: 5 },
      ],
      2,
    );
    expect(r).toEqual([{ chargeId: "a", menge: 2 }]);
  });
  it("returns [] when menge is 0 or no rest exists", () => {
    expect(fefoVerteilung([{ chargeId: "a", verfall: "2026-08", rest: 5 }], 0)).toEqual([]);
    expect(fefoVerteilung([], 5)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails** → FAIL.

- [ ] **Step 3: Implement `src/lib/domain/fefo.ts`**

```ts
export type ChargeRest = { chargeId: string; verfall: string; rest: number };

export function fefoVerteilung(
  chargen: ChargeRest[],
  menge: number,
): { chargeId: string; menge: number }[] {
  let rest = Math.max(0, menge);
  const sortiert = [...chargen]
    .filter((c) => c.rest > 0)
    .sort((a, b) => a.verfall.localeCompare(b.verfall));
  const result: { chargeId: string; menge: number }[] = [];
  for (const c of sortiert) {
    if (rest <= 0) break;
    const nimm = Math.min(c.rest, rest);
    rest -= nimm;
    result.push({ chargeId: c.chargeId, menge: nimm });
  }
  return result;
}
```

- [ ] **Step 4: Run to verify it passes** → PASS.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: add FEFO distribution domain function with tests"`

---

## Task 7: Domain — Bestellvorschlag

**Files:**
- Create: `src/lib/domain/vorschlag.ts`, `src/lib/domain/vorschlag.test.ts`

**Interfaces:**
- Produces:
  - `braucht(bestand: number, mindestbestand: number): boolean` — `bestand < mindestbestand`.
  - `vorschlagsmenge(bestand: number, mindestbestand: number, faktor: number): number` — `faktor * mindestbestand - bestand` (0 when not needed / negative).

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from "vitest";
import { braucht, vorschlagsmenge } from "./vorschlag";

describe("bestellvorschlag", () => {
  it("needs an order below mindestbestand", () => {
    expect(braucht(3, 10)).toBe(true);
    expect(braucht(10, 10)).toBe(false);
    expect(braucht(12, 10)).toBe(false);
  });
  it("suggests faktor*min - bestand", () => {
    expect(vorschlagsmenge(3, 10, 2)).toBe(17); // 2*10 - 3
  });
  it("suggests 0 when not needed", () => {
    expect(vorschlagsmenge(10, 10, 2)).toBe(0);
    expect(vorschlagsmenge(25, 10, 2)).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails** → FAIL.

- [ ] **Step 3: Implement `src/lib/domain/vorschlag.ts`**

```ts
export function braucht(bestand: number, mindestbestand: number): boolean {
  return bestand < mindestbestand;
}

export function vorschlagsmenge(
  bestand: number,
  mindestbestand: number,
  faktor: number,
): number {
  if (!braucht(bestand, mindestbestand)) return 0;
  return Math.max(0, faktor * mindestbestand - bestand);
}
```

- [ ] **Step 4: Run to verify it passes** → PASS.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: add bestellvorschlag domain function with tests"`

---

## Task 8: Extend config with auth/OIDC env + dev-login guard

**Files:**
- Modify: `src/lib/config.ts`, `src/lib/config.test.ts`

**Interfaces:**
- Produces (added to `AppConfig`): `authSecret: string`, `oidcIssuer: string`, `oidcClientId: string`, `oidcClientSecret: string`, `oidcAdminGroup: string`, `authDevLogin: boolean`, `nodeEnv: string`.
- The zod schema THROWS when `AUTH_DEV_LOGIN==="true"` && `NODE_ENV==="production"`.

- [ ] **Step 1: Add failing tests to `src/lib/config.test.ts`**

```ts
it("defaults auth fields and dev-login off", () => {
  const c = parseConfig({});
  expect(c.oidcAdminGroup).toBe("lagerbuch-admin");
  expect(c.authDevLogin).toBe(false);
});

it("throws when AUTH_DEV_LOGIN=true in production", () => {
  expect(() =>
    parseConfig({ NODE_ENV: "production", AUTH_DEV_LOGIN: "true" }),
  ).toThrow();
});

it("allows AUTH_DEV_LOGIN=true outside production", () => {
  const c = parseConfig({ NODE_ENV: "development", AUTH_DEV_LOGIN: "true" });
  expect(c.authDevLogin).toBe(true);
});
```

- [ ] **Step 2: Run to verify the new tests fail** → FAIL.

- [ ] **Step 3: Extend `src/lib/config.ts`**

Add to `AppConfig`:
```ts
  authSecret: string;
  oidcIssuer: string;
  oidcClientId: string;
  oidcClientSecret: string;
  oidcAdminGroup: string;
  authDevLogin: boolean;
  nodeEnv: string;
```
Add a boolean helper and extend the schema + refinement:
```ts
const boolEnv = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");
```
Extend `EnvSchema` with:
```ts
  NODE_ENV: z.string().default("development"),
  AUTH_SECRET: z.string().default("dev-insecure-secret-change-me"),
  OIDC_ISSUER: z.string().default(""),
  OIDC_CLIENT_ID: z.string().default(""),
  OIDC_CLIENT_SECRET: z.string().default(""),
  OIDC_ADMIN_GROUP: z.string().default("lagerbuch-admin"),
  AUTH_DEV_LOGIN: boolEnv,
```
Add a `.superRefine` (or `.refine`) on the schema so `AUTH_DEV_LOGIN && NODE_ENV==="production"` is invalid:
```ts
const EnvSchema = z.object({ /* …existing + new fields… */ }).refine(
  (e) => !(e.AUTH_DEV_LOGIN && e.NODE_ENV === "production"),
  { message: "AUTH_DEV_LOGIN darf in production nicht aktiv sein" },
);
```
Map the new fields in the returned object (`nodeEnv: e.NODE_ENV`, `authSecret: e.AUTH_SECRET`, `oidcIssuer: e.OIDC_ISSUER`, `oidcClientId: e.OIDC_CLIENT_ID`, `oidcClientSecret: e.OIDC_CLIENT_SECRET`, `oidcAdminGroup: e.OIDC_ADMIN_GROUP`, `authDevLogin: e.AUTH_DEV_LOGIN`). NOTE: `.refine` on a `z.object` returns a `ZodEffects`; keep `.safeParse` usage unchanged — it still works. If TS complains that `.default` shape differs, parse with the base object and refine separately, or use `.superRefine`.

- [ ] **Step 4: Run tests** → all config tests PASS (`rtk proxy pnpm test src/lib/config.test.ts`).

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: extend config with auth/OIDC env and dev-login production guard"`

---

## Task 9: Auth.js v5 (OIDC + gated demo login)

**Files:**
- Create: `src/auth.config.ts`, `src/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`

**Interfaces:**
- `src/auth.config.ts` exports `authConfig`: providers + callbacks + `pages` — **edge-safe, imports NO DB code**. Used by both `auth.ts` and the middleware.
- `src/auth.ts` imports `authConfig`, adds the DB `events.signIn` upsert (Node-only), and exports `handlers`, `auth`, `signIn`, `signOut`.
- Session carries `user.isAdmin: boolean`. Demo-login provider id `"dev-login"`, OIDC provider id `"oidc"`.

> **Why the split:** `middleware.ts` (Task 10) runs in the Edge runtime and imports the auth config. `better-sqlite3` cannot run there. So the DB user-upsert lives ONLY in `auth.ts` (`events`), never in `auth.config.ts`.

- [ ] **Step 1: Write `src/auth.config.ts` (edge-safe — NO db import)**

```ts
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { Provider } from "next-auth/providers";
import { config } from "@/lib/config";

const ADMIN_GROUP = config.oidcAdminGroup;

function extractGroups(profile: unknown): string[] {
  const g = (profile as { groups?: unknown } | null)?.groups;
  return Array.isArray(g) ? (g as string[]) : [];
}

const providers: Provider[] = [];

if (config.oidcIssuer) {
  providers.push({
    id: "oidc",
    name: "Pocket ID",
    type: "oidc",
    issuer: config.oidcIssuer,
    clientId: config.oidcClientId,
    clientSecret: config.oidcClientSecret,
    authorization: { params: { scope: "openid profile email groups" } },
  });
}

// Dev-only demo login — impossible in production (config refinement guards it).
if (config.authDevLogin && config.nodeEnv !== "production") {
  providers.push(
    Credentials({
      id: "dev-login",
      name: "Demo-Login (nur Entwicklung)",
      credentials: {},
      authorize: () => ({
        id: "dev-admin",
        name: "Demo-Verwaltung",
        email: "demo@example.com",
        isAdmin: true,
      }),
    }),
  );
}

export const authConfig = {
  secret: config.authSecret,
  trustHost: true,
  providers,
  session: { strategy: "jwt" },
  pages: { signIn: "/", error: "/verwaltung/kein-zugriff" },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === "dev-login") return true;
      if (account?.provider === "oidc") return extractGroups(profile).includes(ADMIN_GROUP);
      return false;
    },
    async jwt({ token, account, profile, user }) {
      if (account?.provider === "oidc") {
        token.isAdmin = extractGroups(profile).includes(ADMIN_GROUP);
        token.sub = (profile as { sub?: string })?.sub ?? token.sub;
      } else if (account?.provider === "dev-login") {
        token.isAdmin = true;
      }
      if (user?.name) token.name = user.name;
      return token;
    },
    async session({ session, token }) {
      session.user.isAdmin = Boolean(token.isAdmin);
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
} satisfies NextAuthConfig;

declare module "next-auth" {
  interface Session {
    user: { id: string; isAdmin: boolean } & import("next-auth").DefaultSession["user"];
  }
  interface User {
    isAdmin?: boolean;
  }
}
declare module "next-auth/jwt" {
  interface JWT {
    isAdmin?: boolean;
  }
}
```

- [ ] **Step 2: Write `src/auth.ts` (Node — adds the DB upsert event)**

```ts
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { getDb } from "@/db";
import { users } from "@/db/schema";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  events: {
    async signIn({ user }) {
      if (!user?.id) return;
      try {
        getDb()
          .insert(users)
          .values({ id: user.id, name: user.name, email: user.email, lastLoginAt: new Date() })
          .onConflictDoUpdate({
            target: users.id,
            set: { name: user.name, email: user.email, lastLoginAt: new Date() },
          })
          .run();
      } catch {
        /* user table upsert is non-critical */
      }
    },
  },
});
```

- [ ] **Step 3: Write the route handler `src/app/api/auth/[...nextauth]/route.ts`**

```ts
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
```

- [ ] **Step 4: Typecheck & build**

Run:
```bash
rtk proxy pnpm typecheck
rtk proxy pnpm build
```
Expected: typecheck + build green. (Auth wiring is exercised end-to-end in Task 10.)

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: add Auth.js v5 (edge-safe config split) with OIDC and gated dev demo-login"`

---

## Task 10: Middleware, Verwaltung shell, no-access page, Gate wiring

**Files:**
- Create: `middleware.ts`, `src/app/verwaltung/layout.tsx`, `src/app/verwaltung/page.tsx`, `src/app/verwaltung/kein-zugriff/page.tsx`
- Modify: `src/components/Gate.tsx`, `src/app/(gate)/page.tsx`
- Create: `e2e/verwaltung.spec.ts`

**Interfaces:**
- Consumes: `auth` from `@/auth`, `config` (for `authDevLogin`). Produces: protected `/verwaltung/*`; a shell page showing the signed-in user; demo-login reachable from the Gate in dev.

- [ ] **Step 1: Write `middleware.ts`**

```ts
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Edge-safe: middleware runs in the Edge runtime, so it builds `auth` from the
// DB-free config (NOT from `@/auth`, which imports better-sqlite3).
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isVerwaltung = req.nextUrl.pathname.startsWith("/verwaltung");
  const isKeinZugriff = req.nextUrl.pathname === "/verwaltung/kein-zugriff";
  if (!isVerwaltung || isKeinZugriff) return;
  if (!req.auth?.user) {
    return Response.redirect(new URL("/", req.nextUrl));
  }
  if (!req.auth.user.isAdmin) {
    return Response.redirect(new URL("/verwaltung/kein-zugriff", req.nextUrl));
  }
});

export const config = {
  matcher: ["/verwaltung/:path*"],
};
```

- [ ] **Step 2: Verwaltung shell**

`src/app/verwaltung/layout.tsx`:
```tsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";

export default async function VerwaltungLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.isAdmin) redirect("/verwaltung/kein-zugriff");
  return (
    <div className="adm">
      <aside className="side">
        <div>
          <div className="brand">LAGER<span>BUCH</span></div>
          <div className="brandsub">Verwaltung</div>
        </div>
        <div style={{ flex: 1 }} />
        <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
          <button className="sitem" type="submit">Abmelden</button>
        </form>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
```
`src/app/verwaltung/page.tsx`:
```tsx
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export default async function VerwaltungHome() {
  const session = await auth();
  return (
    <>
      <div className="mainhead"><h1>Übersicht</h1></div>
      <div className="card cardpad">
        Angemeldet als <strong>{session?.user?.name ?? "—"}</strong>.
        Der Datenkern steht — Artikel, Buchungen und Journal kommen in M1b.
      </div>
    </>
  );
}
```
`src/app/verwaltung/kein-zugriff/page.tsx`:
```tsx
export default function KeinZugriff() {
  return (
    <div className="gate">
      <div className="gatebar" />
      <div className="gatebrand">Kein Zugriff</div>
      <div className="gatesub">
        Dein Konto ist nicht in der Gruppe für die Verwaltung. Wende dich an die Leitung.
      </div>
      <a className="btn btn-ghost" href="/" style={{ marginTop: 16, maxWidth: 240 }}>Zurück</a>
    </div>
  );
}
```

- [ ] **Step 3: Wire the Gate buttons**

In `src/app/(gate)/page.tsx`, pass whether dev login is enabled:
```tsx
import { Gate } from "@/components/Gate";
import { config } from "@/lib/config";

export default function GatePage() {
  return (
    <Gate
      branding={{ appOrg: config.appOrg, appTagline: config.appTagline }}
      oidcEnabled={Boolean(config.oidcIssuer)}
      devLoginEnabled={config.authDevLogin && config.nodeEnv !== "production"}
    />
  );
}
```
In `src/components/Gate.tsx`: extend the props and replace the two Verwaltung buttons. Keep `"use client"`. Use `signIn` from `next-auth/react`:
```tsx
import { signIn } from "next-auth/react";
// props: { branding: {appOrg; appTagline}, oidcEnabled: boolean, devLoginEnabled: boolean }
```
Verwaltung card buttons:
```tsx
<button
  className="btn btn-tinte"
  disabled={!oidcEnabled}
  onClick={() => signIn("oidc", { callbackUrl: "/verwaltung" })}
>
  <Key size={16} /> Mit Pocket ID anmelden
</button>
{devLoginEnabled && (
  <button
    className="btn btn-ghost"
    onClick={() => signIn("dev-login", { callbackUrl: "/verwaltung" })}
  >
    Demo-Login (nur Entwicklung)
  </button>
)}
```
Leave the "Im Dienst" (token) buttons inert — tokens are M2. Remove `appName` remains removed (M0). Note: the Gate becomes interactive via `signIn`, so ensure `SessionProvider` is not required for `signIn` (it isn't — `signIn` works standalone).

- [ ] **Step 4: Failing e2e `e2e/verwaltung.spec.ts`**

```ts
import { expect, test } from "@playwright/test";

test("dev demo-login reaches the Verwaltung shell", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Demo-Login/ }).click();
  await page.waitForURL("**/verwaltung");
  await expect(page.getByRole("heading", { name: "Übersicht" })).toBeVisible();
  await expect(page.getByText(/Angemeldet als/)).toBeVisible();
});
```
The Playwright dev webServer must run with the demo login enabled. In `playwright.config.ts`, add to the `webServer.env`: `AUTH_DEV_LOGIN: "true"`, `AUTH_SECRET: "test-secret"`, `NODE_ENV: "development"` (keep the existing `APP_ORG`).

- [ ] **Step 5: Run — RED then GREEN**

Run: `rtk proxy pnpm e2e` → after Steps 1–3, GREEN (demo login lands on `/verwaltung`, shell visible).

- [ ] **Step 6: Full verification**

```bash
rtk proxy pnpm test
rtk proxy pnpm typecheck
rtk proxy pnpm lint
rtk proxy pnpm build
```
Expected: all green.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: protect /verwaltung, add shell + no-access page, wire Gate sign-in"`

---

## Task 11: Startup migrations via instrumentation

**Files:**
- Create: `instrumentation.ts` (repo root, alongside `next.config.ts`)

**Interfaces:**
- Consumes: `applyMigrations`, `getDb` from `@/db`. Produces: migrations run once when the Node server boots (not in the Edge runtime).

- [ ] **Step 1: Write `instrumentation.ts`**

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { applyMigrations, getDb } = await import("@/db");
    applyMigrations(getDb());
  }
}
```

- [ ] **Step 2: Verify migrations run at boot**

Run:
```bash
rm -rf .data
APP_BASE_URL=http://localhost:3000 AUTH_SECRET=x DATABASE_PATH=./.data/boot.db rtk proxy pnpm build
APP_BASE_URL=http://localhost:3000 AUTH_SECRET=x DATABASE_PATH=./.data/boot.db node .next/standalone/server.js &
sleep 4
curl -sf http://localhost:3000/api/health
ls -la .data/boot.db
kill %1 2>/dev/null || true
```
Expected: `/api/health` → `{"status":"ok"}` and `.data/boot.db` exists with tables (migrations applied at boot). Then remove `.data/`.

- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat: run migrations on server startup via instrumentation"`

---

## Self-Review

**Spec coverage (design spec §5, §6 + plan §7 for the M1a slice):**
- Schema (all 8 tables + bestelltAt + indices) → Task 1 ✓
- Migrations + append-only triggers + PRAGMAs → Tasks 1–3 ✓
- Startup migration (`instrumentation.ts`) → Task 11 ✓
- Domain: bestand, verfall (boundaries/leap year), fefo (kappung + multi-charge split), vorschlag — each with tests → Tasks 4–7 ✓
- Integration: append-only trigger blocks UPDATE/DELETE against `:memory:` → Task 3 ✓
- Auth.js v5 OIDC + group claim; friendly no-access page; users upsert → Tasks 9–10 ✓
- Dev demo-login gated (config throws in prod; provider only registered in dev) → Tasks 8–10 ✓
- Middleware protecting `/verwaltung/*` → Task 10 ✓

**Deferred to M1b (by design):** server actions (zugang/entnahme FEFO transaction, artikel CRUD, korrektur, CSV import) and the full Verwaltung UI (Übersicht KPIs, Artikel table + drawer, Journal). The domain functions and DB layer built here are what M1b consumes.

**Placeholder scan:** none — every step carries real code/commands.

**Type consistency:** `DB` type (Task 2) is reused by `createTestDb` (Task 3) and `getDb` (Auth events). `verfallStatus`/`fefoVerteilung`/`bestand`/`vorschlagsmenge` signatures (Tasks 4–7) are self-contained. `session.user.isAdmin` declared once (Task 9) and consumed by middleware + layout (Task 10). `Gate` props (`branding` without `appName`, `oidcEnabled`, `devLoginEnabled`) match `page.tsx` (Task 10).

**Risk notes for the executor:** (1) Auth.js v5 is `next-auth@beta` — if a callback/type name drifted, adapt to the installed version's types rather than forcing these names, and report it. (2) The Pocket ID `groups` claim depends on operator-side OIDC client config; local verification uses the demo login, which sets `isAdmin` directly. (3) `next-auth/react`'s `signIn` in a client component needs no `SessionProvider`; server-side `auth()` reads the session in RSC/middleware.
