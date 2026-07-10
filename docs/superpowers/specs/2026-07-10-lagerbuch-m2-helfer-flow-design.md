# Lagerbuch M2 — Helfer-Flow — Design-Spec

**Stand:** 2026-07-10 · **Scope dieses Durchlaufs:** Meilenstein M2 (Helfer:innen-Zugang per Token + mobile Entnahme)

---

## 1. Kontext & Autorität

Maßgeblich bleibt [`implementierungsplan.md`](../../../implementierungsplan.md) — hier vor allem **§6 Auth & Rollen** (Token-Ablauf, Deep-Link-Matrix, Klartext-Code-Entscheidung), **§7 Kernlogik** (FEFO), **§8 Anwendungsstruktur** (`t/[code]`, `a/[artikelId]`, `helfer/…`, `lib/auth/rateLimit.ts`, `helferSession.ts`). UI-Referenz ist die `HelferView` in [`mockup.jsx`](../../../mockup.jsx) (Zeilen 344–574) — Wording, Screens, Stepper/Plakette.

**Dieses Dokument dupliziert den Plan nicht.** Es hält fest, was für M2 präzisiert oder gegenüber dem Plan geändert wird, definiert scharfe Abnahmekriterien und ist bei Konflikt maßgeblich (jünger, trägt die bestätigten Entscheidungen). Es baut auf der M0/M1-Spec auf ([`2026-07-10-lagerbuch-m0-m1-design.md`](2026-07-10-lagerbuch-m0-m1-design.md)).

---

## 2. Scope-Entscheidungen (bestätigt, nicht offen)

**Enthalten in M2:**
- Token-Verwaltung in der Admin-UI (Codes anlegen/sperren/reaktivieren, `lastUsedAt` sichtbar) — der Lagerwart braucht sie, um einen funktionierenden Code zu erzeugen und den Flow zu testen.
- Gate-Verdrahtung: Code-Eingabe löst real ein (POST → prüfen → Helfer-Session → Redirect).
- Deep-Links `GET /t/{code}` (QR/Token einlösen) und `/a/{artikelId}` (Regaletikett → Entnahmeseite).
- jose-signierte Helfer-Session (httpOnly-Cookie, TTL `HELFER_SESSION_STUNDEN`).
- Rate-Limit auf die Code-Prüfung (In-Memory-Bucket, 5 Versuche/Minute/IP).
- Sofortige Sperrwirkung: `tokenId` in der Session, bei **jeder schreibenden Aktion** gegen die DB auf `aktiv` geprüft.
- Mobile Helfer-UI: `/helfer` (durchsuchbare Artikelliste) → Artikel-Detail (Bestand, FEFO-Chargenliste, Mengen-Stepper, „Entnahme buchen") → „Beenden".

**Bewusst NICHT in M2 (verschoben):**
- **Fahrzeug-Check → M4.** Der Check validiert gegen `soll_positionen`; es gibt bis M4 weder Editor noch Daten für ein Soll. Die `HelferView` im Mockup bündelt Entnahme **und** Check; unser `/helfer` ist die **Entnahme-Teilmenge**. Die Tab-Leiste zeigt in M2 nur „Entnahme" (kein Check-Tab).
- **Token-Scope-Verhalten.** Bis M4 existiert nur das Handlager als `lagerort`. `tokens.scopeLagerortId` wird gespeichert (Schema ist da), aber für Routing/Filter **ignoriert** (YAGNI). Kommt mit den Fahrzeug-Scopes in M4.
- **In-App-Kamera-Scanner.** Der QR im Etikett kodiert eine URL (`APP_BASE_URL/a/{id}` bzw. `/t/{code}`); die **Kamera-App des Handys** öffnet sie. In-App gibt es stattdessen die **durchsuchbare Artikelliste** als Fallback (nicht jede:r scannt). Kein Scanner-Library-Aufwand in M2. Der „Scan"-Screen aus dem Mockup ist ein Demo-Platzhalter und wird nicht 1:1 portiert.

---

## 3. Bestätigte Präzisierungen (Auth-Architektur)

### 3.1 Drei Cordons, saubere Edge/Node-Trennung

| Präfix | Wer darf rein | Wo geprüft | Bei fehlender Berechtigung |
|---|---|---|---|
| `/verwaltung/**` | Admin (Auth.js-JWT, `isAdmin`) | Middleware (Edge) + `requireAdmin` je Action | Redirect `/` bzw. `/verwaltung/kein-zugriff` (unverändert aus M1) |
| `/helfer/**` | Helfer-Session (jose-Cookie) | Middleware (Edge, Signatur+Ablauf) + `requireHelfer` je Action | Redirect zum Gate `/?returnTo=…` |
| `/a/{id}` | Helfer **oder** Admin | Middleware (Edge) + Seite verzweigt rollenabhängig | Redirect zum Gate `/?returnTo=/a/{id}` |
| `GET /t/{code}` | öffentlich (rate-limited) | **NICHT** im Middleware-Matcher; Prüfung im Route-Handler | Fehlerseite/Redirect zum Gate mit Meldung |

- **Middleware bleibt DB-frei** (läuft in Edge, darf `better-sqlite3` nicht importieren). Sie verifiziert für den Helfer-Cordon nur **Signatur + Ablauf** des jose-Cookies — nicht, ob der Token noch `aktiv` ist (kein DB-Zugriff in Edge).
- **Autoritative Sperrprüfung ist `requireHelfer` in Node** und geschieht bei **jeder schreibenden Aktion**: `tokenId` aus dem Cookie → `SELECT aktiv FROM tokens WHERE id=?` → bei `aktiv=false` (oder nicht gefunden) wirft die Action. Das ist die „sofortige Sperrwirkung" aus Plan §6 — bewusst der eine DB-Lookup pro Buchung. Ein bereits gesperrter Token kann Seiten bis zum Cookie-Ablauf noch **ansehen**, aber **nichts mehr buchen**. Akzeptiert und dokumentiert.
- `/a/{id}` **rollenabhängig** (Plan §8, „Regaletikett-Ziel (rolle-abhängig)"): Helfer-Session → mobile Entnahmeseite; nur Admin-Session → Redirect auf die Admin-Artikelansicht (`/verwaltung/artikel?a={id}`); keine Session → Gate mit `returnTo`.

### 3.2 Helfer-Session (jose)

- **Payload:** `{ tokenId, code, label }` (kein Personenbezug). `code`/`label` nur für Anzeige („Zugang: Token 831-042 · RTW 1"); autoritativ ist stets `tokenId` gegen die DB.
- **Signatur:** `HS256` mit `HELFER_SESSION_SECRET`. **Ablauf** = jetzt + `HELFER_SESSION_STUNDEN` (jose `exp`).
- **Cookie:** Name `helfer_session`, `httpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age` = TTL.
  - **`Secure` nur außerhalb von Entwicklung** (`nodeEnv === "production"` bzw. `APP_BASE_URL` beginnt mit `https://`). Ein hartes `Secure` setzt das Cookie über `http://localhost` **nie** → der ganze Helfer-Flow wäre lokal untestbar. Das ist die erste Falle beim ersten manuellen Test.
- **Getrennt vom Auth.js-Cookie.** Helfer und Admin sind zwei unabhängige Sessions; eine Admin-Session gewährt **keinen** `/helfer`-Zugang (anderes Cookie) und umgekehrt.

### 3.3 Rate-Limit

- In-Memory-Token-Bucket, **5 Versuche / Minute / IP**. Gilt für **beide** Einlöse-Eingänge — Gate-POST **und** `GET /t/{code}` (leicht, einen zu schützen und den anderen zu vergessen).
- **IP hinter dem Proxy:** Der Betreiber betreibt den Reverse-Proxy (compose ohne Traefik), die Socket-IP ist die des Proxys. Daher **`x-forwarded-for` (erster Hop)** lesen, Fallback auf Socket-Remote-Adresse. Ohne das ist der Bucket global (5/min für **alle**). → In `deployment.md` notieren: Proxy muss `X-Forwarded-For` setzen.
- Bucket ist prozesslokal (Single-Process-`standalone`, kein Redis) → **Reset bei Neustart**. Für die Bedrohungslage (physisch laminierte Codes, niedrige Rechte, sofort sperrbar) ausreichend; dokumentieren.

### 3.4 Weitere Härtung

- **`returnTo`-Sanitizing (Open-Redirect-Schutz):** Vor jedem Redirect (`/a/{id}`→Gate und `/t`→`returnTo`) auf lokalen Pfad normalisieren: muss mit `/` beginnen, **kein** `//` (protokoll-relativ), keine absolute URL. Sonst Fallback `/helfer`.
- **`assertProductionSecrets` erweitern:** in Produktion muss auch `HELFER_SESSION_SECRET` gesetzt sein (und ≠ Dev-Default) — sonst ist die Helfer-Session fälschbar, dieselbe Klasse wie der bestehende `AUTH_SECRET`-Guard.

---

## 4. Datenmodell / Config-Deltas

- **Schema:** **keine** Änderung an `tokens` nötig (Tabelle existiert seit M1: `id, code UNIQUE, label, scopeLagerortId, aktiv, createdAt, createdBy, lastUsedAt`). `buchungen` hat bereits `quelleTyp ∈ {token,oidc,system}` + `quelleId`. Ggf. Index `tokens(code)` (UNIQUE deckt das schon ab — nichts zu tun).
- **Config (`src/lib/config.ts`):** neues Feld `helferSessionSecret` aus `HELFER_SESSION_SECRET` (Default `"dev-insecure-secret-change-me"`, analog `AUTH_SECRET`). In `AppConfig`, `BaseEnvSchema`, `parseConfig`-Mapping und `assertProductionSecrets` ergänzen. `stack.env.example` + `generate-secrets.sh` referenzieren `HELFER_SESSION_SECRET` bereits — nur die Code-Verdrahtung fehlt.
- **Dependencies:** `jose` (Session signieren/verifizieren, edge-safe) und `qrcode` (Etiketten/QR — der Plan nennt es; für M2 nur nötig, falls die Token-Verwaltung einen QR/Deep-Link-Preview zeigt; sonst nach M6 verschiebbar). **Entscheidung:** `jose` jetzt; `qrcode` nur, wenn die Token-Liste einen scanbaren Deep-Link zeigt — sonst erst M6 (Etikettendruck). Default: **`jose` jetzt, `qrcode` verschieben** (kein Etikettendruck in M2).

### Buchungsquelle für Helfer-Entnahme
`quelleTyp = "token"`, `quelleId = token.code` (Plan §5: „Token-Code bzw. OIDC-sub"). Das Journal zeigt den Code, nie einen Namen — Datenschutz by Design.

---

## 5. Deliverables (M2)

1. **Config + Guard:** `helferSessionSecret` verdrahten; `assertProductionSecrets` deckt `HELFER_SESSION_SECRET` ab. `jose` als Dependency.
2. **`src/lib/auth/helferSession.ts`:** `createHelferSession(payload)` → signiertes JWT-Cookie-Value; `verifyHelferSession(value)` → Payload | null (Signatur+`exp`); `helferCookieOptions()` (Secure conditional). Pure/edge-safe (kein DB-Import).
3. **`src/lib/auth/rateLimit.ts`:** In-Memory-Bucket `consume(key)` → `{ ok, retryAfter }`; `clientIp(headers, fallback)` (XFF erster Hop). Reine Funktionen, unit-testbar (Zeit injizierbar).
4. **`requireHelfer()`** (in `src/actions/session.ts` neben `requireAdmin`): liest+verifiziert Cookie, prüft `tokens.aktiv` gegen DB, wirft bei Sperre/Fehlen. Liefert `{ tokenId, code }`.
5. **Token einlösen (gemeinsame Server-Logik):** `redeemToken(code, db)` → Token per `code` laden, `aktiv` prüfen, `lastUsedAt` setzen, Session-Cookie erzeugen. Genutzt von Gate-Action **und** `/t/{code}`-Route. Rate-Limit vor der DB-Prüfung.
6. **Gate verdrahten** (`src/app/(gate)/page.tsx` + Action): Code-Feld POSTet an eine Server-Action → `redeemToken` → Cookie + Redirect auf `returnTo` bzw. `/helfer`. Fehlermeldung „Code nicht gefunden oder gesperrt." bzw. Rate-Limit-Hinweis. OIDC-Button (Admin) bleibt.
7. **`GET /t/{code}`** (`src/app/t/[code]/route.ts`): Rate-Limit → `redeemToken` → 302 auf sanitisiertes `returnTo` (Default `/helfer`); bei Fehler 302 auf Gate mit Meldung.
8. **`/a/{artikelId}`** (`src/app/a/[artikelId]/page.tsx`): rollenabhängig (§3.1). Helfer → mobile Entnahme-Detailseite; Admin → Redirect Verwaltung; keine Session → Gate mit `returnTo`.
9. **Helfer-Entnahme-Action:** FEFO-Kern aus dem bestehenden `requireAdmin`-gegateten `bucheEntnahme` (`src/actions/buchung.ts`) **herausfaktorisieren** in eine gate-freie Funktion (Transaktion, Bestand-Kappung, gemeldete Ist-Menge). Zwei dünne Wrapper: Admin (`requireAdmin`, `quelleTyp="oidc"`) und Helfer (`requireHelfer`, `quelleTyp="token"`, `quelleId=code`). **Kein** Copy-Paste der Transaktion (Review-Rubrik lehnt Verbatim-Duplikat ab; Reuse liefert die Kappung gratis).
10. **Mobile Helfer-UI** (`src/app/helfer/…`, portiert/reduziert aus `HelferView`): Topbar mit Token-Label + „Beenden" (löscht Cookie → Gate); `/helfer` = durchsuchbare Artikelliste (Name/Suche); Artikel-Detail = Bestand-Karte, Entnahme-Karte (Stepper + „Entnahme buchen"), FEFO-Chargenliste mit `Plakette`/Chip. Nur „Entnahme"-Tab.
11. **Middleware erweitern** (`src/middleware.ts`): Matcher um `/helfer/:path*` und `/a/:path*`; `/t` bleibt außen vor. Edge-Verifikation des jose-Cookies; Redirect zum Gate mit `returnTo` bei fehlender/ungültiger Helfer-Session. `/verwaltung`-Logik unverändert.
12. **Token-Verwaltung (Admin)** (`src/app/verwaltung/(admin)/tokens/…` + Actions): Liste (Code, Label, aktiv, `lastUsedAt`), Anlegen (Label → generierter Code `NNN-NNN`, eindeutig), Sperren/Reaktivieren. Alles `requireAdmin`. Nav-Eintrag im SideNav.
13. **`deployment.md`-Ergänzung:** Proxy muss `X-Forwarded-For` setzen (sonst globaler Rate-Limit-Bucket); `HELFER_SESSION_SECRET` ist Pflicht in Prod; Bucket resettet bei Neustart.

---

## 6. Definition of Done (M2)

**Lokal verifizierbar (durch mich, per `mise run dev`):**
- Admin legt in der Verwaltung einen Token an → Code erscheint mit `aktiv`, `lastUsedAt` leer.
- Gate: Code eingeben → Helfer-Session gesetzt → Landing `/helfer`; falscher/gesperrter Code → Fehlermeldung, **keine** Session.
- `GET /t/{code}` im Browser (bzw. mit `?returnTo=/a/{id}`) → Session gesetzt → Redirect auf `/helfer` bzw. das (sanitisierte) Ziel.
- `/a/{id}` als Helfer → Entnahmeseite; ohne Session → Gate mit `returnTo`, nach Einlösen zurück auf `/a/{id}`.
- Helfer-Entnahme: Menge wählen → buchen → Bestand = Summe der Buchungen; FEFO verteilt über Chargen; Journal zeigt die Zeile mit **`quelleTyp=token`** und dem Code; Übermenge serverseitig gekappt.
- Admin sperrt den Token → nächste Helfer-Entnahme wird **abgewiesen** (requireHelfer), obwohl das Cookie noch gültig signiert ist.
- Rate-Limit: > 5 Fehlversuche/Minute → Sperre mit Hinweis; nach Ablauf wieder frei.
- `returnTo=//evil.example` bzw. absolute URL wird verworfen (Fallback `/helfer`).
- Alle Unit-/Integration-/e2e-Tests grün; `pnpm build` grün.

**Deploy-Hälfte (Handoff):** auf Staging öffnet ein Handy per QR (`/a/{id}` bzw. `/t/{code}`) die Entnahmeseite und bucht real; Proxy setzt XFF.

---

## 7. Tests (im Plan namentlich zu verankern)

- **Rate-Limiter:** Refill über Zeit; Isolation pro IP (IP A erschöpft ≠ IP B blockiert).
- **`clientIp`:** XFF erster Hop; Fallback auf Socket.
- **jose Round-Trip:** signieren → verifizieren → Payload; abgelaufenes/manipuliertes Token → `null`.
- **`requireHelfer`:** gültige Session + aktiver Token → ok; gesperrter/gelöschter Token → wirft.
- **`redeemToken`:** unbekannter/gesperrter Code → Fehler, keine Session, kein `lastUsedAt`-Update; gültiger Code → `lastUsedAt` gesetzt.
- **`returnTo`-Sanitizer:** `/helfer` ok; `//evil`, `https://evil`, `javascript:` → Fallback.
- **FEFO-Kern (Reuse):** bestehende Entnahme-Tests bleiben grün; neuer Helfer-Wrapper schreibt `quelleTyp=token`.
- **Integration:** Helfer-Entnahme in Transaktion; Übermenge gekappt; Journal-Zeile korrekt bequellt.
- **e2e:** Code einlösen → `/helfer` → Artikel wählen → Entnahme → Journal zeigt `quelleTyp=token`; und: Token sperren → nächste Entnahme bounced.

---

## 8. Handoff / Prerequisites (Betreiber)

Blockieren den Code-Start nicht:
1. Reverse-Proxy muss `X-Forwarded-For` an den Container weiterreichen (Rate-Limit-Genauigkeit).
2. `HELFER_SESSION_SECRET` in `stack.env` via `generate-secrets.sh` (Pflicht in Prod; Guard wirft sonst beim Start).
3. QR-Etiketten (Druck) erst M6 — für M2-Test genügt der Deep-Link im Browser bzw. ein manuell erzeugter QR.
