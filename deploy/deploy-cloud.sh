#!/usr/bin/env bash
# Kasira — deploy the CLOUD-MODE bundle to the VPS (HTTPS domain).
#
# This deploys the bundle that talks DIRECTLY to Supabase Cloud
# (https://cqugtfkxcbnseaefaswq.supabase.co), so NO nginx /api or /realtime
# proxy is needed. Run AFTER you've applied nginx-kasira-subdomain-cloud.conf
# on the VPS (removes the proxy locations).
#
# Uses the same flat-deploy flow the project always used:
#   pscp (Windows PuTTY)  -> upload flat dist/ to /tmp/kasira-dist/
#   plink (Windows PuTTY) -> copy assets into /var/www/kasira + rewrite index.html
#
# Prereqs (on your Windows machine):
#   - PuTTY tools on PATH (pscp, plink)   (they're installed: C:\Program Files\PuTTY)
#   - SSH access to root@203.145.35.68
#   - Run this from the repo root
#
# Usage (from Git Bash):
#   bash deploy/deploy-cloud.sh
#
# If your SSH needs a password each time, add -pw <password> to PSCP/PLINK
# below, or run the pscp/plink lines manually and paste your password.

set -euo pipefail

VPS="root@203.145.35.68"
ROOT="/var/www/kasira"
DIST="dist"
REMOTE_TMP="/tmp/kasira-dist"

echo "==> [1/4] Build cloud-mode bundle"
npx vite build --mode cloud

echo "==> [2/4] Upload flat dist/ to VPS tmp"
# pscp needs a FLAT dir (no assets/ subfolder) per the historical flow.
# pscp can't recursively flatten; instead use -r and handle below.
pscp -r "$DIST/" "${VPS}:${REMOTE_TMP}/" 2>/dev/null \
  || pscp -r "$DIST" "${VPS}:${REMOTE_TMP}/"

echo "==> [3/4] Install into ${ROOT} (index.html owned by www-data → sudo)"
plink -batch "${VPS}" "
  set -e
  mkdir -p ${REMOTE_TMP}
  # assets go to ${ROOT}/assets (Vite assets are under dist/assets/)
  cp -f ${REMOTE_TMP}/assets/*.js ${ROOT}/assets/ 2>/dev/null || true
  cp -f ${REMOTE_TMP}/assets/*.css ${ROOT}/assets/ 2>/dev/null || true
  cp -f ${REMOTE_TMP}/index.html ${ROOT}/index.html 2>/dev/null || true
  # index.html is owned by www-data, so overwrite with sudo
  sudo -S cp -f ${REMOTE_TMP}/index.html ${ROOT}/index.html
  chown www-data:www-data ${ROOT}/index.html 2>/dev/null || true
  echo 'installed'
"

echo "==> [4/4] Verify"
curl -s "${VPS}" -H "Host: kasira.gabriellabs.my.id" 2>/dev/null | head -1 || true

echo "Done. Hard-refresh (Ctrl+Shift+R) on the HTTPS site to pick up the new bundle."
