#!/usr/bin/env bash
# Replaces staging's database with an anonymized copy of production's
# (docs/deployment.md, "Staging data"). Both run on pt-prd-ave-app; the copy
# never leaves the server, and the staging app stays stopped until
# anonymize.sql has run. Needs SSH access with sudo to the server.
#
#   scripts/staging/copy-production.sh <ssh host> <address of the account to keep>
#
# Staging must have been deployed once before: its first start creates the
# database roles (ave_app, ave_auth, ave_policy, ave_team) the copy needs.
set -euo pipefail

host=${1:?usage: copy-production.sh <ssh host> <address of the account to keep>}
keep=${2:?usage: copy-production.sh <ssh host> <address of the account to keep>}
[[ $keep =~ ^[^@[:space:]\'\"]+@[^@[:space:]\'\"]+$ ]] || { echo "not an email address: $keep" >&2; exit 2; }
sql=$(base64 -w0 "$(dirname "$0")/anonymize.sql")

# The steps for the server go as an argument, not on stdin: docker compose exec
# reads stdin and would swallow the steps that follow it. ssh -n gives every
# command on the server an empty stdin; the pipes below give their own.
remote=$(cat <<'REMOTE'
set -euo pipefail
keep=$1
sql=$(base64 -d <<<"$2")
cd /srv/ave-app-staging
echo "Stopping the staging app"
docker compose stop app
echo "Replacing the staging database with production's"
empty() {
  docker compose exec -T postgres psql -U postgres -d template1 -v ON_ERROR_STOP=1 -q \
    -c 'DROP DATABASE IF EXISTS postgres WITH (FORCE)' -c 'CREATE DATABASE postgres'
}
empty
# Until the copy is anonymized, a failure leaves staging with an empty database.
trap 'echo "Failed: staging is left with an empty database" >&2; empty' ERR
(cd /srv/ave-app && docker compose exec -T postgres pg_dump -U postgres -Fc postgres) \
  | docker compose exec -T postgres pg_restore -U postgres -d postgres --exit-on-error
echo "Anonymizing"
printf '%s\n' "$sql" | docker compose exec -T postgres psql -U postgres -d postgres -q -At -v keep_email="$keep"
trap - ERR
echo "Starting the staging app"
docker compose up -d --wait --wait-timeout 180 app
REMOTE
)
ssh -n "$host" "sudo bash -c \"\$(echo $(base64 -w0 <<<"$remote") | base64 -d)\" copy-production $(printf '%q' "$keep") $sql"
