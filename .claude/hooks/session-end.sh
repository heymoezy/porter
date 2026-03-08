#!/bin/bash
# Hook: Stop — write session summary to disk for cross-session continuity
# Records version, files modified, service state after each Claude response
set -uo pipefail

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
STOP_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
TIMESTAMP_SGT=$(TZ=Asia/Singapore date +"%Y-%m-%d %H:%M SGT")

# Prevent recursive stop hooks
if [ "$STOP_ACTIVE" = "true" ]; then
  exit 0
fi

CWD="/home/lobster/documents/porter"
PORTER="$CWD/porter.py"
LOG="$CWD/tasks/session-log.jsonl"

# Current version
VERSION="unknown"
if [ -f "$PORTER" ]; then
  VERSION=$(head -2 "$PORTER" | grep -oP 'v\d+\.\d+\.\d+' || echo "unknown")
fi

# Git state
GIT_DIRTY="false"
LAST_COMMIT="unknown"
if cd "$CWD" 2>/dev/null && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    GIT_DIRTY="true"
  fi
  LAST_COMMIT=$(git log --oneline -1 2>/dev/null || echo "unknown")
fi

# Service status
SERVICE=$(systemctl --user is-active porter 2>/dev/null || echo "unknown")

# Tool call count for this session
COUNTER_FILE="/tmp/claude-tool-count-${SESSION_ID}"
TOOL_COUNT=0
if [ -f "$COUNTER_FILE" ]; then
  TOOL_COUNT=$(cat "$COUNTER_FILE")
fi

# Write to session log
mkdir -p "$(dirname "$LOG")"
echo "{\"ts\":\"$TIMESTAMP\",\"session\":\"$SESSION_ID\",\"version\":\"$VERSION\",\"service\":\"$SERVICE\",\"git_dirty\":$GIT_DIRTY,\"last_commit\":\"$LAST_COMMIT\",\"tool_calls\":$TOOL_COUNT}" >> "$LOG"

exit 0
