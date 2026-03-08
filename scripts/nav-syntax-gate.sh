#!/usr/bin/env bash
# Nav Syntax Gate — prevents shipping JS that breaks switchModule
# Usage: ./scripts/nav-syntax-gate.sh [porter.py path]
set -euo pipefail

PORTER_PATH="${1:-/home/lobster/documents/porter/porter.py}"
JS_TMP="/tmp/porter-inline.js"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "[gate] Extracting inline JS..."
node "$SCRIPT_DIR/extract-inline-js.js" "$PORTER_PATH" "$JS_TMP"

echo "[gate] node --check ..."
if ! node --check "$JS_TMP" 2>/tmp/nav-gate-err.txt; then
  echo "[gate] FAIL: JavaScript syntax error detected!"
  cat /tmp/nav-gate-err.txt
  echo ""
  echo "Fix the syntax error before committing."
  exit 1
fi

echo "[gate] Sentinel checks ..."
FAIL=0
for sentinel in "function switchModule(" "document.querySelectorAll"; do
  if ! grep -q "$sentinel" "$JS_TMP"; then
    echo "[gate] FAIL: missing sentinel: $sentinel"
    FAIL=1
  fi
done
if [ "$FAIL" -ne 0 ]; then
  echo "[gate] Nav sentinel check failed — critical functions missing"
  exit 1
fi

echo "[gate] PASS: syntax + nav sentinels OK"
