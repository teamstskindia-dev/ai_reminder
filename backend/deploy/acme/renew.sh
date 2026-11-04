#!/bin/sh
# Certificate renewal for Remi's HTTPS entry (api.leogix.io). Run it MANUALLY on the server — no scheduler is installed:
#   /opt/remi/acme/renew.sh
# Renews only when the certificate is within 30 days of expiry (safe to run any time); after a renewal it reloads Remi's
# Caddy so the new certificate is served. Remi-only.
set -eu
cd /opt/remi

before=$(stat -c %Y acme/letsencrypt/live/*/fullchain.pem 2>/dev/null || echo 0)
docker compose run --rm --no-deps certbot renew --quiet
after=$(stat -c %Y acme/letsencrypt/live/*/fullchain.pem 2>/dev/null || echo 0)

if [ "$before" != "$after" ]; then
  docker compose exec -T edge caddy reload --force --config /etc/caddy/Caddyfile
  echo "$(date -u +%FT%TZ) certificate renewed, edge reloaded"
fi
