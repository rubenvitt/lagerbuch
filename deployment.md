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

**Einmalig nach dem ersten CI-Publish:** Das GHCR-Package ist anfangs privat.
Sichtbarkeit einmalig auf **Public** stellen (GitHub → Packages → lagerbuch →
Package settings → Change visibility), sonst schlägt `docker compose pull`
mit `denied`/`not found` fehl.

## Konfiguration
1. `./generate-secrets.sh` → erzeugt `stack.env` (AUTH_SECRET,
   HELFER_SESSION_SECRET zufällig; OIDC interaktiv). Datei ist gitignored.
2. Werte in `stack.env` prüfen: `APP_BASE_URL` = die öffentliche URL,
   `APP_ORG`, `IMAGE_TAG`, `HOST_PORT`.

| Variable | Zweck |
|---|---|
| `IMAGE_TAG` | `edge` (Staging) oder `vX.Y.Z` (Prod) |
| `APP_BASE_URL` | öffentliche URL (QR-Deep-Links; compose setzt daraus `AUTH_URL` für die OIDC-`redirect_uri`) |
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
`APP_BASE_URL` muss exakt der öffentlichen URL entsprechen (compose leitet daraus
`AUTH_URL` ab). Ohne korrektes `AUTH_URL` baut Auth.js die OIDC-`redirect_uri` aus
den Request-Headern und landet hinter dem Proxy auf `https://0.0.0.0:3000/...`
→ „redirect_uri not registered".

- **OIDC-Callback beim Pocket-ID-Client registrieren:**
  `${APP_BASE_URL}/api/auth/callback/oidc` (exakt diese URL, sonst weist der
  Provider die Anmeldung ab).

- Der Reverse-Proxy **muss `X-Forwarded-For`** an den Container weiterreichen
  und dabei die **echte Client-IP als letzten Eintrag anhängen** (nginx
  `$proxy_add_x_forwarded_for`, Caddy-Default) – die App vertraut genau diesem
  rechtesten Eintrag. Fehlt der Header, greift das Rate-Limit für
  Token-Gate/`/t` global statt pro Client-IP.
- **`HELFER_SESSION_SECRET`** ist in Produktion Pflicht (Start wirft sonst);
  via `generate-secrets.sh` erzeugen (siehe Konfiguration oben).
- Das Rate-Limit (5 Versuche/Minute/IP) ist prozesslokal (In-Memory) und
  **resettet bei Container-Neustart** – bewusst, kein Redis.

## Update
```bash
# stack.env: IMAGE_TAG anpassen (Staging bleibt edge)
docker compose --env-file stack.env pull
docker compose --env-file stack.env up -d
```

## Rollback
`IMAGE_TAG` auf den vorherigen Tag zurücksetzen, dann `pull` + `up -d`.
Migrationen sind additiv (expand/contract) – Rollback gefahrlos (ab M1).

## Backups (geplant, noch nicht aktiv)
Ein automatischer nächtlicher SQLite-Snapshot-Job nach `/data/backups/`
(Retention 14 Tage) ist geplant, aber **noch nicht implementiert**
(vorgesehen für ein späteres Milestone, ab M6). Der Container schreibt
aktuell **keine** Backups von selbst – verlasse dich bis dahin nicht darauf
und richte eine eigene, manuelle Sicherung ein.

Bis der Job existiert: Sicherung selbst organisieren, z. B. per Cron auf dem
Host über das Named Volume `lagerbuch_data` (Container kurz stoppen oder ein
konsistentes Snapshot-Verfahren für SQLite nutzen, dann `lagerbuch.db`
kopieren).

Restore (weiterhin manuell): Container stoppen, gesicherte Kopie nach
`/data/lagerbuch.db` zurückspielen, Container starten.
