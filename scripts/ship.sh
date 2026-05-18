#!/bin/bash
# Porter ship script — bundles build + restart + pin + verify.
# Run from Porter repo root (or anywhere — uses absolute paths).
set -e

PORTER_DIR=/home/lobster/projects/Porter

echo "Type-check..."
cd "$PORTER_DIR/backend" && npx tsc --noEmit

echo "Build backend..."
npm run build

echo "Restart porter-fastify..."
systemctl --user restart porter-fastify

echo "Waiting for health..."
for i in 1 2 3 4 5 6 7 8 9 10; do
  sleep 2
  if curl -sf http://127.0.0.1:3001/health > /dev/null 2>&1; then
    break
  fi
done

VERSION=$(curl -s http://127.0.0.1:3001/health | jq -r '.version // empty')
if [ -z "$VERSION" ]; then
  echo "✗ Porter /health did not come back — aborting"
  exit 1
fi
echo "✓ Porter live on v${VERSION}"

echo "Pinning active project = Porter..."
curl -s -X POST http://127.0.0.1:3001/api/v1/intellect/active-project \
  -H "content-type: application/json" \
  -d '{"project":"Porter","set_by":"Porter/scripts/ship.sh"}' \
  > /dev/null

echo "Ship complete. Next: update CHECKPOINT.md + commit + push."
