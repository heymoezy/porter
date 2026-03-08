#!/bin/bash
# Hook: PostToolUse — track tool call count and suggest /compact at logical boundaries
# Fires after every tool use; counts calls and suggests compaction at thresholds
set -uo pipefail

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // "unknown"')
COUNTER_FILE="/tmp/claude-tool-count-${SESSION_ID}"

# Initialize or increment counter
if [ -f "$COUNTER_FILE" ]; then
  COUNT=$(cat "$COUNTER_FILE")
  COUNT=$((COUNT + 1))
else
  COUNT=1
fi
echo "$COUNT" > "$COUNTER_FILE"

# Reset counter if user manually compacted (PreCompact hook clears it)
# Suggest at 50, then every 25 after that
SUGGEST=false
if [ "$COUNT" -eq 50 ]; then
  SUGGEST=true
elif [ "$COUNT" -gt 50 ] && [ $(( (COUNT - 50) % 25 )) -eq 0 ]; then
  SUGGEST=true
fi

if [ "$SUGGEST" = true ]; then
  # Output goes to Claude's context as a gentle suggestion
  echo "Tool call #$COUNT this session. Consider running /compact if you've completed a milestone — compacting at logical boundaries preserves more useful context than auto-compaction mid-task."
fi

exit 0
