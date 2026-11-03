#!/bin/sh
# Remi container entrypoint: one image, the first argument (or REMI_PROCESS) picks the process.
#   api | worker | bot | migrate | <any other command>
set -e

PRISMA=/app/node_modules/.bin/prisma
process="${1:-${REMI_PROCESS:-api}}"
[ "$#" -gt 0 ] && shift

case "$process" in
  api)
    exec node dist/main.js
    ;;
  worker)
    exec node dist/worker.js
    ;;
  bot)
    # Headful Chromium needs a display; xvfb-run provides one (bot.headless=true works without it too).
    exec xvfb-run -a --server-args="-screen 0 1280x800x24 -nolisten tcp" node dist/bot.js
    ;;
  migrate)
    "$PRISMA" migrate deploy
    if [ "${SEED_ON_MIGRATE:-true}" = "true" ]; then
      set +e
      node dist/scripts/seed-check.js
      status=$?
      set -e
      if [ "$status" -eq 2 ]; then
        "$PRISMA" db execute --file ./prisma/seed.sql
        echo "seed: default content applied"
      elif [ "$status" -ne 0 ]; then
        echo "seed-check failed; not seeding" >&2
        exit 1
      fi
    fi
    ;;
  *)
    exec "$process" "$@"
    ;;
esac
