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
