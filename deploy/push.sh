#!/usr/bin/env bash
#
# Deploy from local machine to the production server.
#
#   ./deploy/push.sh
#
# Rsyncs the working tree to the server (excluding node_modules, .git,
# the live SQLite db, and uploaded images), then runs install.sh remotely
# to do `npm ci`, fix ownership, restart the service, and reload nginx.
#
# Override defaults via environment if you ever add staging:
#   ILONA_DEPLOY_USER=root
#   ILONA_DEPLOY_HOST=bigbools.fi
#   ILONA_DEPLOY_PORT=2221
#   ILONA_DEPLOY_PATH=/wwwroot/ilona

set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$HERE"

REMOTE_USER="${ILONA_DEPLOY_USER:-root}"
REMOTE_HOST="${ILONA_DEPLOY_HOST:-bigbools.fi}"
REMOTE_PORT="${ILONA_DEPLOY_PORT:-2221}"
REMOTE_PATH="${ILONA_DEPLOY_PATH:-/wwwroot/ilona}"

SSH_CMD="ssh -A -p ${REMOTE_PORT}"
DEST="${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}/"

echo "==> rsync  ./  ->  ${DEST}"
rsync -avz --delete \
  -e "$SSH_CMD" \
  --exclude '.git/' \
  --exclude '.idea/' \
  --exclude 'node_modules/' \
  --exclude 'ilona.db' \
  --exclude 'ilona.db-shm' \
  --exclude 'ilona.db-wal' \
  --exclude 'ilona.db-journal' \
  --exclude 'images/' \
  --exclude '*.log' \
  --exclude 'all_image_urls.txt' \
  --exclude 'unique_image_urls.txt' \
  ./ "$DEST"

echo "==> Running install.sh on ${REMOTE_HOST}"
$SSH_CMD "${REMOTE_USER}@${REMOTE_HOST}" "${REMOTE_PATH}/deploy/install.sh"

echo "==> Done."
