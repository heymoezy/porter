#!/bin/bash
# Hook: PreCompact — reset the tool call counter so suggest-compact starts fresh
set -uo pipefail

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
COUNTER_FILE="/tmp/claude-tool-count-${SESSION_ID}"

# Reset counter on compaction
echo "0" > "$COUNTER_FILE"

exit 0
