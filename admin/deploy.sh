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

cd "$FRONTEND_DIR"

# A type error must stop the deploy, not ship. `react-router build` does not typecheck.
echo "Type-checking admin SPA..."
npx tsc --noEmit

echo "Building admin SPA..."
npm run build

echo "Mirroring build/client → $WEB_DIR (for Caddy)..."
mkdir -p "$WEB_DIR"
rsync -a --delete build/client/ "$WEB_DIR/"

echo "Verifying..."
curl -s -o /dev/null -w 'https://askporter.app/: %{http_code}\n' https://askporter.app/ || true
curl -s -o /dev/null -w 'https://askporter.app/api/v1/health: %{http_code}\n' https://askporter.app/api/v1/health || true

echo "Deploy complete."
