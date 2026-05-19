#!/usr/bin/env bash
#
# Interactive admin password changer for the Ilona app.
# Updates ADMIN_PASS in /etc/ilona.env and restarts the service.
#
#   sudo /wwwroot/ilona/deploy/set-admin-password.sh
#
# Handles any password characters safely by writing a single-quoted value
# (with internal single quotes escaped) — systemd's EnvironmentFile parser
# accepts this and won't try to expand $, ", or backticks.

set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/ilona.env}"
SERVICE_NAME="${SERVICE_NAME:-ilona}"

die() { printf '\033[1;31mxx\033[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]]      || die "Run as root: sudo $0"
[[ -f "$ENV_FILE" ]]   || die "$ENV_FILE not found — run install.sh first"

read -r -s -p "New admin password: " pass1; echo
read -r -s -p "Confirm:            " pass2; echo

[[ "$pass1" == "$pass2" ]] || die "Passwords don't match"
[[ -n "$pass1" ]]          || die "Empty password — aborted"
[[ ${#pass1} -ge 8 ]]      || die "Password must be at least 8 characters"

# Single-quote the value and escape any embedded single quotes ('  ->  '\'')
escaped=${pass1//\'/\'\\\'\'}
new_line="ADMIN_PASS='${escaped}'"

# Rewrite the env file atomically: build a tmp file alongside, then mv.
tmp=$(mktemp --tmpdir=/etc ilona.env.XXXXXX)
trap 'rm -f "$tmp"' EXIT
chown root:www-data "$tmp"
chmod 640 "$tmp"

found=0
while IFS= read -r line || [[ -n "$line" ]]; do
  if [[ "$line" =~ ^[[:space:]]*ADMIN_PASS= ]]; then
    printf '%s\n' "$new_line" >> "$tmp"
    found=1
  else
    printf '%s\n' "$line" >> "$tmp"
  fi
done < "$ENV_FILE"

(( found )) || printf '%s\n' "$new_line" >> "$tmp"

mv "$tmp" "$ENV_FILE"
trap - EXIT
chown root:www-data "$ENV_FILE"
chmod 640 "$ENV_FILE"

echo "Password updated. Restarting ${SERVICE_NAME}..."
systemctl restart "$SERVICE_NAME"
echo "Done."
