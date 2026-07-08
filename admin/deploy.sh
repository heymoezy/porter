#!/bin/bash
# Deploy script for the Porter admin SPA (porter-admin-ui).
#
# The admin SPA is a static React Router (SPA-mode) build. It is NOT served
# by a Node process — Caddy (public TLS, askporter.app) serves the built
# files directly from /home/websites/porter/admin, and proxies /api/* to the
# Porter Fastify brain on :3001. /home/lobster is mode 700 (caddy can't
# traverse into the source tree), so the build output must be copied out to
# a caddy-readable path. Hence this script, mirroring ymc.capital/deploy.sh.
#
# Usage: bash /home/lobster/projects/Porter/admin/deploy.sh
set -e

ADMIN_DIR="/home/lobster/projects/Porter/admin"
FRONTEND_DIR="$ADMIN_DIR/frontend.archived"
WEB_DIR="/home/websites/porter/admin"

# Bake the ONE release truth (backend version + PORTER_RELEASES feed) into the
# admin build so version/footer/changelog render from a single, current source
# — not the admin's drifting package.json or a stale baked CHANGELOG.
echo "Baking release info from backend truth..."
( cd "/home/lobster/projects/Porter/backend" && npx tsx scripts/gen-admin-release-info.ts )

echo "Building admin SPA..."
cd "$FRONTEND_DIR"
npm run build

echo "Mirroring build/client → $WEB_DIR (for Caddy)..."
mkdir -p "$WEB_DIR"
rsync -a --delete build/client/ "$WEB_DIR/"

echo "Verifying..."
curl -s -o /dev/null -w 'https://askporter.app/: %{http_code}\n' https://askporter.app/ || true
curl -s -o /dev/null -w 'https://askporter.app/api/v1/health: %{http_code}\n' https://askporter.app/api/v1/health || true

echo "Deploy complete."
echo ""
echo "NOTE: Caddy's askporter.app -> static-file-server + /api proxy routing is"
echo "applied via the Caddy admin API and is EPHEMERAL (reverts if caddy is"
echo "restarted/reloaded from the on-disk Caddyfile, which still points"
echo "askporter.app straight at :3001). Durable persistence needs one sudo"
echo "edit to /etc/caddy/Caddyfile — see _ops/askporter-login-fix.md. This"
echo "script only ships the SPA bundle; it does not touch Caddy routing."
