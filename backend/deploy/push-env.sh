#!/usr/bin/env bash
# Push backend/.env.production (git-ignored, on your machine) to the production VPS and restart Remi's app containers.
#
# Why this exists: a deploy ships CODE only. CI never sees the application secrets (they are kept out of git and
# GitHub on purpose), so a variable you add to backend/.env.production reaches production only when you push it:
#
#   cd backend
#   npm run env:push                 # shows which variables change (names only), asks, applies, waits for health
#   npm run env:push -- --dry-run    # only show the differences
#   npm run env:push -- --yes        # no prompt
#
# It touches Remi only: /opt/remi/.env.production and the remi-prod api / worker / bot containers. Values are never
# printed. The previous server file is kept as /opt/remi/.env.production.bak-<UTC time>; if api/worker/bot are not
# healthy after the restart, that backup is restored and the containers are restarted on it.
#
# Hostinger's Docker Manager → Environment box shows /opt/remi/.env (compose settings: COMPOSE_PROFILES, API_DOMAIN).
# App secrets do not belong there: the containers read /opt/remi/.env.production.
#
# Overrides: REMI_VPS (ssh target, default root@194.238.16.75), REMI_ENV_FILE (local file), WAIT_TIMEOUT (seconds).

set -euo pipefail

REMOTE="${REMI_VPS:-root@194.238.16.75}"
REMOTE_DIR=/opt/remi
SERVICES="api worker bot"
WAIT_TIMEOUT="${WAIT_TIMEOUT:-300}"

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
LOCAL_FILE="${REMI_ENV_FILE:-$script_dir/../.env.production}"
TEMPLATE="$script_dir/../.env.production.example"

dry_run=false
assume_yes=false
for arg in "$@"; do
  case $arg in
    --dry-run) dry_run=true ;;
    --yes | -y) assume_yes=true ;;
    -h | --help)
      sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (use --dry-run, --yes or --help)" >&2
      exit 2
      ;;
  esac
done

die() {
  echo "ERROR: $*" >&2
  exit 1
}

if command -v sha256sum >/dev/null 2>&1; then
  sha() { sha256sum | cut -c1-16; }
else
  sha() { shasum -a 256 | cut -c1-16; }
fi

# "KEY<TAB>hash(value)" per variable, sorted — lets us compare files without ever printing a value.
fingerprint() {
  local line skip='^[[:space:]]*(#|$)'
  while IFS= read -r line || [[ -n $line ]]; do
    [[ $line =~ $skip ]] && continue
    printf '%s\t%s\n' "${line%%=*}" "$(printf '%s' "${line#*=}" | sha)"
  done | LC_ALL=C sort
}

keys_of() { sed -nE 's/^([A-Za-z_][A-Za-z0-9_]*)=.*/\1/p' "$1" | LC_ALL=C sort; }

ssh_remi() { ssh -o ConnectTimeout=15 "$REMOTE" "$@"; }

# ---------------------------------------------------------------- local checks (nothing leaves this machine yet)
[[ -f $LOCAL_FILE ]] || die "$LOCAL_FILE not found. Copy backend/.env.production.example to it and fill it in."
LOCAL_FILE=$(cd "$(dirname "$LOCAL_FILE")" && pwd)/$(basename "$LOCAL_FILE")

if LC_ALL=C grep -q $'\r' "$LOCAL_FILE"; then
  die "$LOCAL_FILE has Windows line endings (CRLF); Docker would keep the \\r in every value. Convert it to LF."
fi

bad_lines=$(grep -nvE '^[[:space:]]*(#.*)?$|^[A-Za-z_][A-Za-z0-9_]*=' "$LOCAL_FILE" | cut -d: -f1 | tr '\n' ' ' || true)
[[ -z $bad_lines ]] || die "$LOCAL_FILE: lines ${bad_lines}are not KEY=value, comments or blank."

dupes=$(keys_of "$LOCAL_FILE" | uniq -d | tr '\n' ' ')
[[ -z $dupes ]] || die "$LOCAL_FILE defines these variables more than once: ${dupes}— keep one of each."

grep -qE '^NODE_ENV=production[[:space:]]*$' "$LOCAL_FILE" ||
  die "$LOCAL_FILE does not say NODE_ENV=production — refusing to push what looks like a development file."

if [[ -f $TEMPLATE ]]; then
  missing=$(LC_ALL=C comm -23 <(keys_of "$TEMPLATE" | uniq) <(keys_of "$LOCAL_FILE" | uniq) | tr '\n' ' ')
  [[ -z $missing ]] || echo "Note: in .env.production.example but not in your file (the app default applies): $missing"
fi

# ---------------------------------------------------------------- compare with the server
echo "Comparing $(basename "$LOCAL_FILE") with $REMOTE:$REMOTE_DIR/.env.production (names only) …"
remote_raw=$(ssh_remi "test -d $REMOTE_DIR || { echo 'missing $REMOTE_DIR' >&2; exit 3; }; cat $REMOTE_DIR/.env.production 2>/dev/null || true") ||
  die "could not read $REMOTE_DIR on $REMOTE (ssh failed or the directory is missing)."

plan=$(LC_ALL=C join -t $'\t' -a1 -a2 -e '-' -o 0,1.2,2.2 \
  <(fingerprint <"$LOCAL_FILE") <(printf '%s' "$remote_raw" | fingerprint))
unset remote_raw

added=$(awk -F'\t' '$3 == "-" { print $1 }' <<<"$plan")
removed=$(awk -F'\t' '$2 == "-" { print $1 }' <<<"$plan")
changed=$(awk -F'\t' '$2 != "-" && $3 != "-" && $2 != $3 { print $1 }' <<<"$plan")

if [[ -z $added$removed$changed ]]; then
  echo "Production already has exactly these values. Nothing to do."
  exit 0
fi

print_group() {
  [[ -n $2 ]] || return 0
  echo "  $1:"
  sed 's/^/    /' <<<"$2"
}
echo
echo "Changes for production:"
print_group "add (new on the server)" "$added"
print_group "update (value differs)" "$changed"
print_group "REMOVE (only on the server — they disappear)" "$removed"
echo

if $dry_run; then
  echo "Dry run: nothing was changed."
  exit 0
fi

if ! $assume_yes; then
  [[ -t 0 ]] || die "not a terminal; re-run with --yes to apply without a prompt."
  echo "Applying restarts Remi's api, worker and bot (~1–2 minutes; a bot inside a live meeting leaves it)."
  read -r -p "Apply to production? [y/N] " answer
  [[ $answer == [yY] || $answer == [yY][eE][sS] ]] || {
    echo "Cancelled."
    exit 1
  }
fi

# ---------------------------------------------------------------- apply
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup=".env.production.bak-$stamp"

# Atomic replace: write a 0600 temp file, keep a backup of the current one, then move the new file into place.
{
  cat "$LOCAL_FILE"
  [[ -z $(tail -c1 "$LOCAL_FILE") ]] || echo
} | ssh_remi "set -eu; umask 077; cd $REMOTE_DIR
  cat > .env.production.new
  if [ -f .env.production ]; then cp -p .env.production $backup; fi
  mv .env.production.new .env.production
  chmod 600 .env.production" || die "upload failed; the server file was not changed."
echo "Uploaded. Previous file kept as $REMOTE_DIR/$backup"

echo "Restarting $SERVICES and waiting until they are healthy (up to ${WAIT_TIMEOUT}s) …"
# --force-recreate: containers read env_file only when created. Dependencies (redis) are left alone.
if ssh_remi "cd $REMOTE_DIR && docker compose up -d --force-recreate --wait --wait-timeout $WAIT_TIMEOUT $SERVICES"; then
  ssh_remi "cd $REMOTE_DIR && docker compose ps $SERVICES --format 'table {{.Service}}\t{{.Status}}'"
  echo
  echo "Done: production now runs with your backend/.env.production."
  exit 0
fi

echo >&2
echo "Containers did not become healthy — restoring $backup and restarting on the previous values …" >&2
if ssh_remi "set -eu; cd $REMOTE_DIR; test -f $backup; cp -p $backup .env.production
  docker compose up -d --force-recreate --wait --wait-timeout $WAIT_TIMEOUT $SERVICES"; then
  echo "Rolled back. Production runs on the previous values again." >&2
else
  echo "Rollback restart did not report healthy either. Check it now:" >&2
fi
echo "  ssh $REMOTE 'cd $REMOTE_DIR && docker compose ps && docker compose logs --tail 80 api'" >&2
exit 1
