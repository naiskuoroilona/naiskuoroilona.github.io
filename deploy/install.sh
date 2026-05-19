#!/usr/bin/env bash
#
# Idempotent install/deploy for the Ilona Express app.
# Run on the server after `git pull` (or after the initial rsync).
#
#   sudo /wwwroot/ilona/deploy/install.sh
#
# What it does:
#   - Installs Node.js (NodeSource) if missing or too old
#   - npm ci --omit=dev
#   - Creates /etc/ilona.env on first run (with a random ADMIN_PASS)
#   - Symlinks the systemd unit and nginx conf from the repo
#   - Reloads systemd + nginx, restarts the ilona service
#
# Safe to re-run. Never touches /etc/ilona.env once it exists — use
# set-admin-password.sh for that.

set -euo pipefail

REPO_DIR="${REPO_DIR:-/wwwroot/ilona}"
NODE_MAJOR="${NODE_MAJOR:-20}"
SERVICE_NAME="ilona"
APP_USER="www-data"
APP_GROUP="www-data"
ENV_FILE="/etc/ilona.env"
NGINX_LINK="/etc/nginx/conf.d/ilona.conf"
SYSTEMD_LINK="/etc/systemd/system/${SERVICE_NAME}.service"

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31mxx\033[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run as root: sudo $0"
[[ -f "${REPO_DIR}/server.js" ]] || die "No server.js in ${REPO_DIR} — set REPO_DIR or rsync the code first"
[[ -f "${REPO_DIR}/deploy/ilona.service" ]] || die "Missing ${REPO_DIR}/deploy/ilona.service"
[[ -f "${REPO_DIR}/deploy/nginx.conf"   ]] || die "Missing ${REPO_DIR}/deploy/nginx.conf"

# --- 1. Node.js -----------------------------------------------------------
need_node=0
if ! command -v node >/dev/null 2>&1; then
  need_node=1
else
  current=$(node -p 'process.versions.node.split(".")[0]')
  if (( current < NODE_MAJOR )); then
    warn "Node ${current}.x found, need >= ${NODE_MAJOR}.x"
    need_node=1
  fi
fi

if (( need_node )); then
  log "Installing Node.js ${NODE_MAJOR}.x from NodeSource"
  command -v curl >/dev/null || apt-get install -y curl ca-certificates
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
log "Node: $(node --version), npm: $(npm --version)"

# --- 2. App dependencies --------------------------------------------------
log "Installing dependencies (npm ci --omit=dev)"
cd "$REPO_DIR"
npm ci --omit=dev

# --- 3. Ownership ---------------------------------------------------------
# Tree is owned by the human user (so they can rsync/edit without sudo);
# group is www-data so the service can read everything. Runtime write
# targets (images/, ilona.db*) get group-writable bits; setgid on images/
# makes new files inherit the www-data group.
DEPLOY_USER="${SUDO_USER:-$APP_USER}"
log "Setting ownership to ${DEPLOY_USER}:${APP_GROUP}"
chown -R "${DEPLOY_USER}:${APP_GROUP}" "$REPO_DIR"
chmod -R o-rwx,g+rX "$REPO_DIR"

mkdir -p "${REPO_DIR}/images"
chown "${DEPLOY_USER}:${APP_GROUP}" "${REPO_DIR}/images"
chmod 2775 "${REPO_DIR}/images"      # group-writable + setgid

for f in ilona.db ilona.db-shm ilona.db-wal; do
  if [[ -f "${REPO_DIR}/${f}" ]]; then
    chown "${APP_USER}:${APP_GROUP}" "${REPO_DIR}/${f}"
    chmod 660 "${REPO_DIR}/${f}"
  fi
done

# --- 4. /etc/ilona.env (first-run only) -----------------------------------
if [[ ! -f "$ENV_FILE" ]]; then
  log "Creating $ENV_FILE with a random ADMIN_PASS"
  rand_pass=$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 24)
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
ADMIN_USER=admin
ADMIN_PASS='${rand_pass}'
EOF
  chown root:"$APP_GROUP" "$ENV_FILE"
  chmod 640 "$ENV_FILE"
  warn "Initial admin password (save this — it won't be shown again):"
  printf '    \033[1;32m%s\033[0m\n' "$rand_pass"
  warn "Change with: sudo ${REPO_DIR}/deploy/set-admin-password.sh"
else
  log "$ENV_FILE already exists — leaving it alone"
fi

# --- 5. systemd unit symlink ---------------------------------------------
target="${REPO_DIR}/deploy/ilona.service"
if [[ -L "$SYSTEMD_LINK" && "$(readlink -f "$SYSTEMD_LINK")" == "$(readlink -f "$target")" ]]; then
  log "systemd unit already linked"
else
  log "Linking systemd unit: $SYSTEMD_LINK -> $target"
  rm -f "$SYSTEMD_LINK"
  ln -s "$target" "$SYSTEMD_LINK"
fi

systemctl daemon-reload
systemctl enable "$SERVICE_NAME" >/dev/null
log "Restarting ${SERVICE_NAME}"
systemctl restart "$SERVICE_NAME"

# --- 6. nginx conf symlink -----------------------------------------------
target="${REPO_DIR}/deploy/nginx.conf"
if [[ -L "$NGINX_LINK" && "$(readlink -f "$NGINX_LINK")" == "$(readlink -f "$target")" ]]; then
  log "nginx conf already linked"
else
  log "Linking nginx conf: $NGINX_LINK -> $target"
  rm -f "$NGINX_LINK"
  ln -s "$target" "$NGINX_LINK"
fi

log "Testing nginx config"
if nginx -t; then
  systemctl reload nginx
  log "nginx reloaded"
else
  die "nginx config test failed — not reloading"
fi

# --- 7. Summary -----------------------------------------------------------
echo
log "Done. Service status:"
systemctl status "$SERVICE_NAME" --no-pager --lines=5 || true
echo
log "Logs: journalctl -u ${SERVICE_NAME} -f"
