#!/usr/bin/env bash
#
# Verify Porter's outbound mail END TO END — does a reset code actually ARRIVE?
#
# "It compiled" and "postfix is running" are not the question. The question is
# whether a locked-out operator receives the code. This checks the whole chain
# and, critically, reports the REMOTE SERVER'S VERDICT rather than the fact that
# we handed the message over. A 250 from Google is proof; "queued" is not.
#
# Usage:  bash verify-mail.sh [recipient]
set -uo pipefail

TO="${1:-moe@themozaic.com}"
DOMAIN="askporter.app"
SELECTOR="porter"
PASS=0; FAIL=0
ok(){ echo "  [ok]   $*"; PASS=$((PASS+1)); }
bad(){ echo "  [FAIL] $*"; FAIL=$((FAIL+1)); }

echo "== 1. Local server reachable on the port Porter uses =="
if timeout 5 bash -c 'cat < /dev/null > /dev/tcp/127.0.0.1/587' 2>/dev/null; then
  ok "127.0.0.1:587 accepting connections"
else
  bad "127.0.0.1:587 refused — Porter cannot hand off mail (is postfix installed?)"
fi

echo "== 2. DKIM signer running =="
if timeout 5 bash -c 'cat < /dev/null > /dev/tcp/127.0.0.1/8891' 2>/dev/null; then
  ok "opendkim milter on 127.0.0.1:8891"
else
  bad "opendkim not reachable — mail would go out UNSIGNED and be filtered"
fi

echo "== 3. DNS the receiving server will check =="
SPF=$(dig +short TXT "$DOMAIN" 2>/dev/null | grep -i 'v=spf1' | head -1)
[[ -n "$SPF" ]] && ok "SPF: $SPF" || bad "no SPF record"
DK=$(dig +short TXT "${SELECTOR}._domainkey.${DOMAIN}" 2>/dev/null | head -1)
[[ -n "$DK" ]] && ok "DKIM ${SELECTOR} published (${#DK} chars)" \
                || bad "DKIM ${SELECTOR}._domainkey.${DOMAIN} NOT published — publish porter-dkim.txt"
DM=$(dig +short TXT "_dmarc.${DOMAIN}" 2>/dev/null | head -1)
[[ -n "$DM" ]] && ok "DMARC: $DM" || bad "no DMARC record"

echo "== 4. Reverse DNS (the usual reason mail is rejected) =="
PTR=$(dig +short -x 76.13.190.52 2>/dev/null | head -1)
if [[ "$PTR" == "mail.${DOMAIN}." ]]; then
  ok "PTR = $PTR"
else
  bad "PTR = ${PTR:-none} (want mail.${DOMAIN}.) — ask Hostinger; expect filtering until fixed"
fi

echo "== 5. Outbound port 25 not blocked by the host =="
if timeout 8 bash -c 'cat < /dev/null > /dev/tcp/gmail-smtp-in.l.google.com/25' 2>/dev/null; then
  ok "outbound :25 open"
else
  bad "outbound :25 blocked — standalone sending is impossible on this host"
fi

echo "== 6. REAL send through Porter's own code path =="
BEFORE=$(date +%s)
CODE_HTTP=$(curl -s -o /tmp/vm.json -w '%{http_code}' -m 25 -X POST \
  http://127.0.0.1:3001/api/v1/auth/forgot-password \
  -H 'content-type: application/json' -d "{\"email\":\"${TO}\"}" 2>/dev/null)
[[ "$CODE_HTTP" == "200" ]] && ok "forgot-password returned 200" || bad "forgot-password returned $CODE_HTTP"

# Porter fails SOFT on send errors (v6.132.0), so a 200 does NOT mean it sent.
# The service log is the only place that distinguishes them.
sleep 3
if journalctl --user -u porter-fastify --since "@${BEFORE}" --no-pager 2>/dev/null | grep -q 'send FAILED'; then
  bad "Porter logged 'send FAILED' — it could not hand the message to the server"
elif journalctl --user -u porter-fastify --since "@${BEFORE}" --no-pager 2>/dev/null | grep -q 'email-dev'; then
  bad "Porter fell back to console logging — SMTP not actually used"
else
  ok "Porter handed the message off without error"
fi

echo "== 7. What the RECEIVING server said (the only real proof) =="
sleep 5
VERDICT=$(sudo -n tail -n 200 /var/log/mail.log 2>/dev/null | grep "to=<${TO}>" | tail -1)
if [[ -z "$VERDICT" ]]; then
  echo "  [??]   no delivery line found in /var/log/mail.log (need sudo, or mail not yet processed)"
  echo "         run: sudo tail -50 /var/log/mail.log | grep ${TO}"
elif grep -qi 'status=sent' <<<"$VERDICT"; then
  ok "ACCEPTED by the receiving server:"; echo "         ${VERDICT##*status=}"
elif grep -qiE 'status=(bounced|deferred)' <<<"$VERDICT"; then
  bad "REJECTED/DEFERRED — this is the answer that matters:"; echo "         ${VERDICT##*status=}"
else
  echo "  [??]   $VERDICT"
fi

echo
echo "== $PASS passed, $FAIL failed =="
echo "Even on all-pass, CHECK THE INBOX — 'accepted' can still mean the spam folder."
[[ $FAIL -eq 0 ]] || exit 1
