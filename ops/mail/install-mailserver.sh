#!/usr/bin/env bash
#
# Porter standalone outbound mail server — Postfix + OpenDKIM on Ubuntu 24.04.
#
# WHY THIS EXISTS
#   Porter's password-reset flow needs to send mail. Moe's decision (2026-07-29):
#   completely standalone, no Google relay. Porter's SMTP settings already point
#   at 127.0.0.1:587, so this script builds the server that was always assumed to
#   be there and never installed.
#
# WHAT IT DOES
#   • Postfix as a SEND-ONLY relay bound to loopback. It does NOT accept mail from
#     the internet: inet_interfaces=loopback-only. That matters — an MTA listening
#     on a public :25 with a default config is a spam magnet and a standing risk,
#     and Porter only ever needs to send.
#   • Submission on 127.0.0.1:587 (what Porter is already configured for), no auth,
#     because only processes on this box can reach loopback.
#   • OpenDKIM signs everything from askporter.app with selector `porter`.
#
# WHAT IT DOES NOT DO
#   • Receive mail. askporter.app's MX points here, so inbound still bounces —
#     unchanged from today, where nothing listens at all. DMARC aggregate reports
#     to postmaster@askporter.app will not be collected.
#   • Fix reverse DNS. See the PTR note at the end — this is the item most likely
#     to decide whether Gmail accepts the mail, and it needs Hostinger.
#
# SAFE TO RE-RUN. Every step is idempotent; existing config is backed up once.
set -euo pipefail

DOMAIN="askporter.app"
HOSTNAME="mail.${DOMAIN}"
SELECTOR="porter"
KEY_SRC="/home/lobster/projects/Porter/ops/mail/porter-dkim.private"
STAMP="$(date +%Y%m%d-%H%M%S)"

if [[ $EUID -ne 0 ]]; then echo "Run with sudo: sudo bash $0" >&2; exit 1; fi
[[ -f "$KEY_SRC" ]] || { echo "Missing DKIM key at $KEY_SRC" >&2; exit 1; }

echo "==> 1/6 Installing postfix + opendkim (non-interactive)"
# Preseed so the postfix installer does not open its curses wizard and stall.
debconf-set-selections <<EOF
postfix postfix/main_mailer_type select Internet Site
postfix postfix/mailname string ${HOSTNAME}
EOF
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq postfix opendkim opendkim-tools

echo "==> 2/6 Installing the DKIM key (selector ${SELECTOR})"
install -d -m 750 -o opendkim -g opendkim "/etc/opendkim/keys/${DOMAIN}"
install -m 600 -o opendkim -g opendkim "$KEY_SRC" "/etc/opendkim/keys/${DOMAIN}/${SELECTOR}.private"

printf '%s._domainkey.%s %s:%s:/etc/opendkim/keys/%s/%s.private\n' \
  "$SELECTOR" "$DOMAIN" "$DOMAIN" "$SELECTOR" "$DOMAIN" "$SELECTOR" > /etc/opendkim/KeyTable
printf '*@%s %s._domainkey.%s\n' "$DOMAIN" "$SELECTOR" "$DOMAIN" > /etc/opendkim/SigningTable
printf '127.0.0.1\n::1\nlocalhost\n%s\n' "$DOMAIN" > /etc/opendkim/TrustedHosts
chown opendkim:opendkim /etc/opendkim/KeyTable /etc/opendkim/SigningTable /etc/opendkim/TrustedHosts

echo "==> 3/6 Configuring OpenDKIM"
[[ -f /etc/opendkim.conf.orig ]] || cp -a /etc/opendkim.conf "/etc/opendkim.conf.orig"
cat > /etc/opendkim.conf <<EOF
Syslog                  yes
UMask                   007
Mode                    s
Canonicalization        relaxed/simple
KeyTable                /etc/opendkim/KeyTable
SigningTable            refile:/etc/opendkim/SigningTable
ExternalIgnoreList      /etc/opendkim/TrustedHosts
InternalHosts           /etc/opendkim/TrustedHosts
Socket                  inet:8891@127.0.0.1
PidFile                 /run/opendkim/opendkim.pid
OversignHeaders         From
UserID                  opendkim
EOF

echo "==> 4/6 Configuring Postfix (send-only, loopback only)"
cp -a /etc/postfix/main.cf "/etc/postfix/main.cf.bak-${STAMP}"
cp -a /etc/postfix/master.cf "/etc/postfix/master.cf.bak-${STAMP}"

postconf -e "myhostname = ${HOSTNAME}"
postconf -e "myorigin = ${DOMAIN}"
# Not reachable from the internet. Porter is on this box; nothing else needs in.
postconf -e "inet_interfaces = loopback-only"
postconf -e "inet_protocols = ipv4"
# Empty mydestination: do not try to deliver anything locally, always send out.
postconf -e "mydestination ="
postconf -e "relayhost ="
postconf -e "mynetworks = 127.0.0.0/8 [::1]/128"
postconf -e "smtpd_relay_restrictions = permit_mynetworks, reject_unauth_destination"
postconf -e "smtp_tls_security_level = may"
postconf -e "smtpd_tls_security_level = none"
postconf -e "milter_default_action = accept"
postconf -e "milter_protocol = 6"
postconf -e "smtpd_milters = inet:127.0.0.1:8891"
postconf -e "non_smtpd_milters = inet:127.0.0.1:8891"
postconf -e "maillog_file = /var/log/mail.log"

# Submission on 127.0.0.1:587 — the address Porter is already configured for.
if ! grep -qE '^127\.0\.0\.1:587[[:space:]]+inet' /etc/postfix/master.cf; then
  cat >> /etc/postfix/master.cf <<'EOF'

# Porter submission — loopback only, no auth required (nothing off-box can reach it)
127.0.0.1:587 inet n       -       y       -       -       smtpd
  -o syslog_name=postfix/submission
  -o smtpd_tls_security_level=none
  -o smtpd_sasl_auth_enable=no
  -o smtpd_client_restrictions=permit_mynetworks,reject
EOF
fi

echo "==> 5/6 Starting services"
systemctl enable --now opendkim
systemctl restart opendkim
systemctl enable --now postfix
systemctl restart postfix

echo "==> 6/6 Checks"
sleep 2
ss -lptn | grep -E ':(587|8891)\b' || echo "  WARNING: expected listeners not found"
systemctl is-active opendkim postfix

cat <<EOF

DONE — server is up. Two things still needed for delivery:

  1. PUBLISH THIS DNS RECORD (TXT):
       name:  ${SELECTOR}._domainkey.${DOMAIN}
       value: see /home/lobster/projects/Porter/ops/mail/porter-dkim.txt

     There is an orphaned 'default._domainkey' record whose private key is lost.
     Leave it or delete it; this uses selector '${SELECTOR}' and ignores it.

  2. REVERSE DNS (PTR) — ask Hostinger to set the PTR for 76.13.190.52 to:
       ${HOSTNAME}

     It currently says srv1379868.hstgr.cloud. This is the single biggest factor
     in whether Gmail accepts the mail. Everything else can be right and a
     mismatched PTR alone will still get mail filtered.

Then run the verifier:  bash /home/lobster/projects/Porter/ops/mail/verify-mail.sh
EOF
