# M6 Etiketten & Backup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** QR-Etikettendruck (`/verwaltung/etiketten`, Print-CSS 48,5 × 25,4 mm, Deep-Links) + ein startup-sicherer interner Backup-Job.

**Architecture:** QR serverseitig via `qrcode` (PNG-Data-URI), Auswahl clientseitig, Print-CSS blendet Chrome + Abgewählte aus. Backup-Job als guardrail-gesicherter stündlich-idempotenter Job in `instrumentation.ts`, getestet nur an der puren Fläche.

**Tech Stack:** Next.js 15, React 19, TS strict, Drizzle + better-sqlite3, qrcode, Vitest, Playwright.

## Global Constraints

- **Design-Spec** [`docs/superpowers/specs/2026-07-12-lagerbuch-m6-etiketten-backup-design.md`](../specs/2026-07-12-lagerbuch-m6-etiketten-backup-design.md) ist maßgeblich.
- **Backup-Job darf den Startup NIEMALS brechen:** Registrierung + jeder Tick in try/catch (loggen, schlucken); nur `NEXT_RUNTIME==="nodejs"` **und** `nodeEnv==="production"`; KEIN Präzis-Scheduler — stündlicher `setInterval`, Snapshot nur wenn Stunde `===2` und heute keine Datei; getestet werden nur `backupDateiname`/`veralteteBackups` (nicht Timer/`.backup()`).
- **QR serverseitig**, absoluter Deep-Link (`${config.appBaseUrl}/a/${id}` bzw. `/t/${code}`); `qrcode` server-only (nie in Edge/Client). Print-CSS blendet App-Chrome + abgewählte Etiketten aus.
- **Actions/Pages** gaten auf `requireAdmin`. `qrcode` + `@types/qrcode` als Dependencies. **RTK:** `rtk proxy pnpm …`.

---

## File Structure

**Neu:** `src/db/backup.ts` (+`.test.ts`), `src/db/etiketten.ts` (+`.test.ts`), `src/app/verwaltung/(admin)/etiketten/{page,EtikettenBogen}.tsx`, `e2e/etiketten.spec.ts`.
**Geändert:** `src/instrumentation.ts` (Backup-Wiring), `src/app/globals.css` (Etiketten- + Print-CSS), `src/components/SideNav.tsx`, `package.json`.

---

### Task 1: Backup-Job (startup-sicher)

**Files:**
- Create: `src/db/backup.ts`
- Create: `src/db/backup.test.ts`
- Modify: `src/instrumentation.ts`

**Interfaces:** `backupDateiname(now: Date): string`; `veralteteBackups(dateien: string[], now: Date, retentionTage: number): string[]`; `starteBackupJob(): void`.

- [ ] **Step 1: Failing test** — `src/db/backup.test.ts` (nur pure Fläche):
```ts
import { describe, expect, it } from "vitest";
import { backupDateiname, veralteteBackups } from "./backup";

describe("backup pure", () => {
  it("backupDateiname mit Nullpad", () => {
    expect(backupDateiname(new Date(2026, 6, 3))).toBe("lagerbuch-20260703.db");
    expect(backupDateiname(new Date(2026, 11, 25))).toBe("lagerbuch-20261225.db");
  });
  it("veralteteBackups selektiert > retention alte, ignoriert Fremdnamen", () => {
    const now = new Date(2026, 6, 20);
    const dateien = ["lagerbuch-20260701.db", "lagerbuch-20260718.db", "andere.db", "lagerbuch-xxxx.db"];
    expect(veralteteBackups(dateien, now, 14)).toEqual(["lagerbuch-20260701.db"]);
  });
});
```

- [ ] **Step 2: Test rot** — `rtk proxy pnpm vitest run src/db/backup.test.ts` → FAIL.

- [ ] **Step 3: `src/db/backup.ts`**
```ts
import { existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { getSqlite } from "@/db";
import { config } from "@/lib/config";

function pad2(n: number): string { return String(n).padStart(2, "0"); }

export function backupDateiname(now: Date): string {
  return `lagerbuch-${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}.db`;
}

// Backup-Dateinamen selektieren, die aelter als retentionTage sind (Fremdnamen ignoriert).
export function veralteteBackups(dateien: string[], now: Date, retentionTage: number): string[] {
  const grenze = now.getTime() - retentionTage * 86_400_000;
  return dateien.filter((f) => {
    const m = /^lagerbuch-(\d{4})(\d{2})(\d{2})\.db$/.exec(f);
    if (!m) return false;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() < grenze;
  });
}

async function snapshot(now: Date): Promise<void> {
  const backupDir = join(dirname(config.databasePath), "backups");
  mkdirSync(backupDir, { recursive: true });
  const ziel = join(backupDir, backupDateiname(now));
  if (existsSync(ziel)) return; // heute schon gesichert
  await getSqlite().backup(ziel);
  for (const alt of veralteteBackups(readdirSync(backupDir), now, 14)) {
    try { unlinkSync(join(backupDir, alt)); } catch { /* ignore */ }
  }
}

// Guardrail: darf den Startup NIEMALS brechen. Stuendlicher idempotenter Tick;
// Snapshot nur wenn Stunde==2 und heute noch keine Datei. Aufrufer ruft nur in Produktion.
export function starteBackupJob(): void {
  try {
    const tick = () => {
      const now = new Date();
      if (now.getHours() === 2) snapshot(now).catch((e) => console.error("[backup] snapshot:", e));
    };
    const iv = setInterval(tick, 60 * 60 * 1000);
    iv.unref?.();
    tick();
  } catch (e) {
    console.error("[backup] start:", e);
  }
}
```

- [ ] **Step 4: `instrumentation.ts` erweitern** — im nodejs-Block, nach den bestehenden Zeilen:
```ts
    if (config.nodeEnv === "production") {
      try {
        const { starteBackupJob } = await import("@/db/backup");
        starteBackupJob();
      } catch (e) {
        console.error("[backup] init:", e);
      }
    }
```
(`config` ist im Block bereits importiert.)

- [ ] **Step 5: Tests grün + typecheck** — `rtk proxy pnpm vitest run src/db/backup.test.ts && rtk proxy pnpm typecheck` → PASS.

- [ ] **Step 6: Commit**
```bash
git add src/db/backup.ts src/db/backup.test.ts src/instrumentation.ts
git commit -m "feat: startup-safe internal backup job (hourly idempotent snapshot, 14d retention)"
```

---

### Task 2: `qrcode`-Dependency + `etikettenDaten`

**Files:**
- Modify: `package.json` (via pnpm)
- Create: `src/db/etiketten.ts`
- Create: `src/db/etiketten.test.ts`

**Interfaces:** `etikettenDaten(db: DB): Promise<{ artikel: {id;name;fach;url;qr}[]; tokens: {code;label;url;qr}[] }>` (qr = PNG-Data-URI, url = absoluter Deep-Link; nur aktive).

- [ ] **Step 1: qrcode installieren**
```bash
pnpm add qrcode && pnpm add -D @types/qrcode
```
Expected: `qrcode` in dependencies, `@types/qrcode` in devDependencies.

- [ ] **Step 2: Failing test** — `src/db/etiketten.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/config", () => ({ config: { appBaseUrl: "https://lager.example" } }));
import { createTestDb } from "@/db/testing";
import { artikel, tokens, newId } from "@/db/schema";
import { etikettenDaten } from "./etiketten";

describe("etikettenDaten", () => {
  it("liefert aktive Artikel + Token mit absolutem Deep-Link + QR-Data-URI", async () => {
    const db = createTestDb();
    const a = newId();
    db.insert(artikel).values({ id: a, name: "NaCl", einheit: "Fl.", fach: "B2", mindestbestand: 0, createdAt: new Date() }).run();
    db.insert(tokens).values({ id: newId(), code: "831-042", label: "RTW 1", aktiv: true, createdAt: new Date(), createdBy: "admin1" }).run();
    db.insert(tokens).values({ id: newId(), code: "000-000", label: "gesperrt", aktiv: false, createdAt: new Date(), createdBy: "admin1" }).run();
    const d = await etikettenDaten(db);
    expect(d.artikel).toHaveLength(1);
    expect(d.artikel[0].url).toBe(`https://lager.example/a/${a}`);
    expect(d.artikel[0].qr.startsWith("data:image/png")).toBe(true);
    expect(d.tokens).toHaveLength(1); // gesperrter ausgeschlossen
    expect(d.tokens[0].url).toBe("https://lager.example/t/831-042");
    expect(d.tokens[0].qr.startsWith("data:image/png")).toBe(true);
  });
});
```

- [ ] **Step 3: Test rot** — `rtk proxy pnpm vitest run src/db/etiketten.test.ts` → FAIL (Modul fehlt).

- [ ] **Step 4: `src/db/etiketten.ts`**
```ts
import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import type { DB } from "@/db";
import { artikel, tokens } from "@/db/schema";
import { config } from "@/lib/config";

export type ArtikelEtikett = { id: string; name: string; fach: string; url: string; qr: string };
export type TokenEtikett = { code: string; label: string; url: string; qr: string };

function qr(text: string): Promise<string> {
  return QRCode.toDataURL(text, { margin: 1, width: 200 });
}

export async function etikettenDaten(db: DB): Promise<{ artikel: ArtikelEtikett[]; tokens: TokenEtikett[] }> {
  const base = config.appBaseUrl.replace(/\/$/, "");
  const arts = db.select().from(artikel).where(eq(artikel.aktiv, true)).all();
  const toks = db.select().from(tokens).where(eq(tokens.aktiv, true)).all();
  const artikelEtiketten = await Promise.all(arts.map(async (a) => {
    const url = `${base}/a/${a.id}`;
    return { id: a.id, name: a.name, fach: a.fach, url, qr: await qr(url) };
  }));
  const tokenEtiketten = await Promise.all(toks.map(async (t) => {
    const url = `${base}/t/${t.code}`;
    return { code: t.code, label: t.label, url, qr: await qr(url) };
  }));
  return { artikel: artikelEtiketten, tokens: tokenEtiketten };
}
```

- [ ] **Step 5: Test grün** — `rtk proxy pnpm vitest run src/db/etiketten.test.ts` → PASS.

- [ ] **Step 6: Commit**
```bash
git add package.json pnpm-lock.yaml src/db/etiketten.ts src/db/etiketten.test.ts
git commit -m "feat: qrcode dep + etikettenDaten (active artikel/tokens with deep-link QR data-URIs)"
```

---

### Task 3: Etiketten-UI + Print-CSS + SideNav

**Files:**
- Create: `src/app/verwaltung/(admin)/etiketten/page.tsx`
- Create: `src/app/verwaltung/(admin)/etiketten/EtikettenBogen.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/components/SideNav.tsx`

**Interfaces:** Consumes `etikettenDaten` (T2).

- [ ] **Step 1: SideNav** — Import `QrCode` ergänzen und NAV-Eintrag:
```ts
  { href: "/verwaltung/etiketten", label: "Etiketten", icon: QrCode },
```
(`QrCode` aus `lucide-react` in den bestehenden Import aufnehmen.)

- [ ] **Step 2: `page.tsx`** (async Server)
```tsx
import { getDb } from "@/db";
import { etikettenDaten } from "@/db/etiketten";
import { EtikettenBogen } from "./EtikettenBogen";

export const dynamic = "force-dynamic";

export default async function EtikettenPage() {
  const { artikel, tokens } = await etikettenDaten(getDb());
  return (
    <>
      <div className="mainhead no-print"><h1>Etiketten</h1></div>
      <p className="footnote no-print" style={{ marginBottom: 12 }}>Artikel- und Token-Etiketten mit QR-Deep-Link. Auswählen und drucken – im Druck erscheinen nur gewählte Etiketten im 48,5 × 25,4 mm-Raster.</p>
      <EtikettenBogen artikel={artikel} tokens={tokens} />
    </>
  );
}
```

- [ ] **Step 3: `EtikettenBogen.tsx`** (Client)
```tsx
"use client";
import { useState } from "react";
import { Printer } from "lucide-react";

type A = { id: string; name: string; fach: string; url: string; qr: string };
type T = { code: string; label: string; url: string; qr: string };

export function EtikettenBogen({ artikel, tokens }: { artikel: A[]; tokens: T[] }) {
  const keys = [...artikel.map((a) => `a:${a.id}`), ...tokens.map((t) => `t:${t.code}`)];
  const [selected, setSelected] = useState<Set<string>>(new Set(keys));

  function toggle(k: string) {
    setSelected((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }

  function etikett(k: string, qr: string, titel: string, sub: string) {
    return (
      <label className={`etikett${selected.has(k) ? "" : " deselected"}`} key={k}>
        <input type="checkbox" className="no-print" checked={selected.has(k)} onChange={() => toggle(k)} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt={`QR ${titel}`} width={72} height={72} />
        <div className="etikett-txt"><div className="etikett-titel">{titel}</div><div className="etikett-sub">{sub}</div></div>
      </label>
    );
  }

  if (keys.length === 0) return <div className="card cardpad no-print">Keine aktiven Artikel oder Token.</div>;

  return (
    <>
      <div className="etikett-controls no-print" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button className="btn btn-ghost" onClick={() => setSelected(new Set(keys))}>Alle</button>
        <button className="btn btn-ghost" onClick={() => setSelected(new Set())}>Keine</button>
        <button className="btn btn-rot" onClick={() => window.print()}><Printer size={15} /> Drucken ({selected.size})</button>
      </div>
      <div className="etikettbogen">
        {artikel.map((a) => etikett(`a:${a.id}`, a.qr, a.name, a.fach))}
        {tokens.map((t) => etikett(`t:${t.code}`, t.qr, t.label, t.code))}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Print-CSS** — ans Ende von `src/app/globals.css`:
```css
/* ——— Etiketten (Bildschirm) ——— */
.etikettbogen{display:grid;grid-template-columns:repeat(auto-fill,48.5mm);gap:2mm}
.etikett{width:48.5mm;height:25.4mm;box-sizing:border-box;display:flex;align-items:center;gap:2.5mm;padding:2mm;border:1px dashed var(--linie);border-radius:4px;overflow:hidden;cursor:pointer;background:#fff}
.etikett.deselected{opacity:.35}
.etikett img{width:20mm;height:20mm;flex:none}
.etikett input{margin:0;flex:none}
.etikett-txt{min-width:0}
.etikett-titel{font:700 11px var(--display);line-height:1.05;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.etikett-sub{font:600 9px var(--mono);color:var(--stahl)}

/* ——— Etiketten (Druck): nur der Bogen, nur gewaehlte, ohne Chrome ——— */
@media print{
  @page{margin:8mm}
  body *{visibility:hidden}
  .etikettbogen,.etikettbogen *{visibility:visible}
  .etikettbogen{position:absolute;left:0;top:0;width:100%;gap:0}
  .etikett{border:none;border-radius:0;opacity:1}
  .etikett.deselected{display:none !important}
  .etikett input,.no-print{display:none !important}
}
```

- [ ] **Step 5: Typecheck + Lint + Build** — `rtk proxy pnpm typecheck && rtk proxy pnpm lint && rtk proxy pnpm build` → grün (die `no-img-element`-Regel ist per Inline-Disable an der QR-`<img>`-Zeile abgedeckt).

- [ ] **Step 6: Commit**
```bash
git add src/app/verwaltung/\(admin\)/etiketten src/app/globals.css src/components/SideNav.tsx
git commit -m "feat: etiketten print sheet (selectable QR labels, 48.5x25.4mm print-CSS) + sidenav"
```

---

### Task 4: e2e — Etiketten-Seite rendert QR

**Files:**
- Create: `e2e/etiketten.spec.ts`

**Interfaces:** Demo-Login (Admin), bestehende geseedete Artikel/Token.

- [ ] **Step 1: `e2e/etiketten.spec.ts`**
```ts
import { test, expect } from "@playwright/test";

test("Etiketten-Seite rendert QR-Etiketten für geseedete Artikel/Token", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo-Login (nur Entwicklung)" }).click();
  await expect(page).toHaveURL(/\/verwaltung/);

  await page.goto("/verwaltung/etiketten");
  await expect(page.getByRole("heading", { name: "Etiketten" })).toBeVisible();

  const qr = page.locator(".etikett img").first();
  await expect(qr).toBeVisible();
  await expect(qr).toHaveAttribute("src", /^data:image\/png/);

  // Drucken-Button vorhanden
  await expect(page.getByRole("button", { name: /Drucken/ })).toBeVisible();
});
```

- [ ] **Step 2: e2e** — `rtk proxy pnpm exec playwright test e2e/etiketten.spec.ts` → grün.

- [ ] **Step 3: Commit**
```bash
git add e2e/etiketten.spec.ts
git commit -m "test: e2e etiketten page renders deep-link QR images"
```

---

## Abschluss

Nach Task 4: `rtk proxy pnpm typecheck && rtk proxy pnpm lint && rtk proxy pnpm test && rtk proxy pnpm build` grün. Whole-Branch-Review (adversarial), Fix-Wave, dann lokal in `main` mergen (wie M0–M5). **Kein Push.** Danach als Schlussgate die **volle Playwright-Suite** einmal komplett laufen lassen.
