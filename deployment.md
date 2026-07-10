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
