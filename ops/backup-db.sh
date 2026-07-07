#!/bin/bash
# Nightly pg_dump backup of the porter PostgreSQL DB.
#
# Why: the users table was found emptied in the live DB with NO existing
# backup anywhere to restore from (2026-07-06). This is the guardrail —
# read-only against the DB (pg_dump takes a consistent snapshot, never
# mutates), keeps the last N dumps, and is restorable with pg_restore.
#
# Format: custom (-Fc), which is compressed and lets you restore a single
# table (e.g. just `users`) without touching the rest of the DB:
#   pg_restore -d porter --data-only --table=users <dump-file>
# or a full restore into a fresh DB:
#   createdb porter_restore_test && pg_restore -d porter_restore_test <dump-file>
#
# Caveat verified 2026-07-06: restoring into a BRAND NEW empty DB as a
# non-superuser role fails on `CREATE EXTENSION vector`/`pg_trgm` (permission
# denied), which cascades into recall_doc_chunks failing to (re)create — every
# OTHER table, including `users`, restores fine and was verified byte-for-byte
# against live. For a from-scratch disaster recovery: have a superuser
# `CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pg_trgm;`
# in the target DB first, then pg_restore normally.
#
# Usage: bash /home/lobster/projects/Porter/ops/backup-db.sh
set -euo pipefail

DB_NAME="${PORTER_DB_NAME:-porter}"
DB_USER="${PORTER_DB_USER:-lobster}"
DB_HOST="${PORTER_DB_HOST:-127.0.0.1}"
export PGPASSWORD="${PORTER_DB_PASSWORD:-porter}"

BACKUP_DIR="/home/lobster/projects/Porter/storage/backups"
KEEP_N=14   # ~2 weeks of nightly dumps at ~160MB DB size = well within disk budget

mkdir -p "$BACKUP_DIR"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/porter-db-$TS.dump"
TMP="$OUT.partial"

echo "[backup-db] $(date -u +%FT%TZ) dumping $DB_NAME -> $OUT"
pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -Fc -f "$TMP"
mv "$TMP" "$OUT"

SIZE=$(du -h "$OUT" | cut -f1)
echo "[backup-db] wrote $OUT ($SIZE)"

# Prune: keep only the newest KEEP_N dumps.
COUNT=$(ls -1 "$BACKUP_DIR"/porter-db-*.dump 2>/dev/null | wc -l)
if [ "$COUNT" -gt "$KEEP_N" ]; then
  ls -1t "$BACKUP_DIR"/porter-db-*.dump | tail -n +"$((KEEP_N + 1))" | while read -r old; do
    echo "[backup-db] pruning old dump: $old"
    rm -f "$old"
  done
fi

echo "[backup-db] done. $(ls -1 "$BACKUP_DIR"/porter-db-*.dump 2>/dev/null | wc -l) dump(s) retained."
