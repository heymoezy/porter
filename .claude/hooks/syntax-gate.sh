#!/bin/bash
# Hook: PostToolUse — auto syntax check after every porter.py edit
# Blocks Claude if syntax is broken, forcing immediate fix
set -uo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Only check porter.py edits
if [[ -z "$FILE_PATH" ]] || [[ "$FILE_PATH" != *"porter.py" ]]; then
  exit 0
fi

# Verify file exists
if [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

# Run Python syntax check
RESULT=$(python3 -c "import py_compile; py_compile.compile('$FILE_PATH', doraise=True)" 2>&1)
if [ $? -ne 0 ]; then
  echo "SYNTAX ERROR in porter.py — fix before continuing: $RESULT" >&2
  exit 2  # Block
fi

exit 0
