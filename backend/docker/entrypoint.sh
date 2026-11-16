#!/bin/sh
# Remi container entrypoint: one image, the first argument (or REMI_PROCESS) picks the process.
#   api | worker | bot | migrate | <any other command>
# MIGRATE_ON_START=true makes `api` apply pending migrations (and seed an empty database) before it starts, so a
# Watchtower image update needs no separate migrate step. Prisma's advisory lock serialises concurrent runs.
set -e

PRISMA=/app/node_modules/.bin/prisma
process="${1:-${REMI_PROCESS:-api}}"
[ "$#" -gt 0 ] && shift

migrate() {
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
}

case "$process" in
  api)
    if [ "${MIGRATE_ON_START:-false}" = "true" ]; then
      migrate
    fi
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
    migrate
    ;;
  bot-login)
    # One-time sign-in of the bot's own Google account into the persistent profile the bot uses (BOT_PROFILE_DIR).
    # Viewed over VNC (port 5900, password BOT_LOGIN_VNC_PASSWORD); publish it on 127.0.0.1 only and use an SSH tunnel.
    # Stop the bot first: one profile can only be open in one browser.
    : "${BOT_PROFILE_DIR:?BOT_PROFILE_DIR is not set}"
    : "${BOT_LOGIN_VNC_PASSWORD:?set BOT_LOGIN_VNC_PASSWORD for this VNC session}"
    mkdir -p "$BOT_PROFILE_DIR"
    rm -f "$BOT_PROFILE_DIR/SingletonLock" "$BOT_PROFILE_DIR/SingletonSocket" "$BOT_PROFILE_DIR/SingletonCookie"
    Xvfb :99 -screen 0 1280x800x24 -nolisten tcp >/dev/null 2>&1 &
    export DISPLAY=:99
    sleep 1
    x11vnc -storepasswd "$BOT_LOGIN_VNC_PASSWORD" /tmp/vncpass >/dev/null 2>&1
    x11vnc -display :99 -rfbport 5900 -rfbauth /tmp/vncpass -forever -shared -quiet -bg -o /tmp/x11vnc.log
    echo "bot-login: VNC is up on port 5900. Sign in to the bot's Google account, then stop this container (Ctrl+C)."
    exec chromium --no-sandbox --user-data-dir="$BOT_PROFILE_DIR" --no-first-run --no-default-browser-check \
      --window-size=1280,800 --lang=en-US "https://accounts.google.com/"
    ;;
  *)
    exec "$process" "$@"
    ;;
esac
