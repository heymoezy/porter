#!/usr/bin/env bash
set -u
LOG_DIR="/home/lobster/.porter/runtime"
LOG_FILE="$LOG_DIR/coord-watch.log"
PID_FILE="$LOG_DIR/coord-watch.pid"
mkdir -p "$LOG_DIR"
echo $$ > "$PID_FILE"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] coord-watch started pid=$$" >> "$LOG_FILE"
while true; do
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "[$ts] pulse start" >> "$LOG_FILE"
  python3 /home/lobster/documents/porter/scripts/coordinate_via_porter.py \
    "Porter auto coordination heartbeat. Return one-line status and blocker." \
    --timeout 25 >> "$LOG_FILE" 2>&1 || echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] pulse command failed" >> "$LOG_FILE"
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] pulse end" >> "$LOG_FILE"
  sleep 120 || true
done
