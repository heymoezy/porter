#!/bin/bash
# Stalwart Mail Server setup for askporter.app
# Run this AFTER Docker is available to lobster user.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ADMIN_PASS="porter-mail-admin-2026"
DOMAIN="askporter.app"
MAILBOX_USER="porter"
MAILBOX_PASS="porter-mail-2026"
STALWART_API="https://127.0.0.1:8443"
AUTH="admin:${ADMIN_PASS}"

echo "=== Step 1: Start Stalwart ==="
cd "$SCRIPT_DIR"
docker compose up -d
echo "Waiting 10s for Stalwart to initialize..."
sleep 10

echo ""
echo "=== Step 2: Check health ==="
HTTP_CODE=$(curl -sk -o /dev/null -w "%{http_code}" "${STALWART_API}" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "000" ]; then
    echo "ERROR: Stalwart not responding on ${STALWART_API}"
    echo "Check: docker logs stalwart-mail"
    exit 1
fi
echo "Stalwart responding (HTTP ${HTTP_CODE})"

echo ""
echo "=== Step 3: Create domain ${DOMAIN} ==="
curl -sk -X POST "${STALWART_API}/api/principal" \
  -u "${AUTH}" \
  -H "Content-Type: application/json" \
  -d "{\"type\": \"domain\", \"name\": \"${DOMAIN}\"}"
echo ""

echo ""
echo "=== Step 4: Get DNS records ==="
echo "Add these DNS records to askporter.app:"
echo "---"
curl -sk -u "${AUTH}" "${STALWART_API}/api/dns/records/${DOMAIN}" | python3 -m json.tool 2>/dev/null || \
  curl -sk -u "${AUTH}" "${STALWART_API}/api/dns/records/${DOMAIN}"
echo ""
echo "---"

echo ""
echo "=== Step 5: Create mailbox ${MAILBOX_USER}@${DOMAIN} ==="
curl -sk -X POST "${STALWART_API}/api/principal" \
  -u "${AUTH}" \
  -H "Content-Type: application/json" \
  -d "{\"type\": \"individual\", \"name\": \"${MAILBOX_USER}\", \"emails\": [\"${MAILBOX_USER}@${DOMAIN}\"], \"secrets\": [\"${MAILBOX_PASS}\"]}"
echo ""

echo ""
echo "=== Step 6: Verify ==="
echo "Ports listening:"
ss -tlnp 2>/dev/null | grep -E ':(25|465|587|993|4190|8443)\s' || echo "(check manually)"
echo ""
echo "Container status:"
docker ps --filter name=stalwart-mail --format "table {{.Status}}\t{{.Ports}}"
echo ""
echo "=== Done ==="
echo "Admin UI: https://$(hostname -I | awk '{print $1}'):8443"
echo "Login: admin / ${ADMIN_PASS}"
echo ""
echo "Next steps:"
echo "1. Add DNS records shown above to Cloudflare/registrar"
echo "2. Set rDNS/PTR to mail.askporter.app in Hostinger panel"
echo "3. Update Porter env vars (STALWART_URL, MAIL_DEFAULT_DOMAIN)"
