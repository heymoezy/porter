#!/bin/bash
# ─────────────────────────────────────────────────────────────
# gen-changelog.sh — Auto-generate CHANGELOG.md from git history
#
# How it works:
#   1. Reads current version from package.json (staged or working)
#   2. Checks if CHANGELOG.md already has this version
#   3. If not, collects commits since last CHANGELOG.md update
#   4. Generates a new entry and prepends it
#   5. Stages CHANGELOG.md
#
# Called from:
#   - .git/hooks/pre-commit (auto-stages)
#   - npm run prebuild
# ─────────────────────────────────────────────────────────────

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Read version from staged package.json if available, else working copy
if git diff --cached --name-only 2>/dev/null | grep -q "^package.json$"; then
  PKG_VERSION=$(git show :package.json 2>/dev/null | node -p "JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).version")
else
  PKG_VERSION=$(node -p "require('./package.json').version")
fi

TODAY=$(date +%Y-%m-%d)
CHANGELOG="$ROOT/CHANGELOG.md"

# Check if CHANGELOG.md already has this version (check working copy)
if [ -f "$CHANGELOG" ] && head -1 "$CHANGELOG" | grep -q "v${PKG_VERSION}"; then
  exit 0
fi

# Find the commit where CHANGELOG.md was last touched
LAST_CL_COMMIT=$(git log -1 --format=%H -- CHANGELOG.md 2>/dev/null || echo "")

# Collect commits since then (or all commits if no prior changelog)
if [ -n "$LAST_CL_COMMIT" ]; then
  COMMITS=$(git log --format="- %s" "${LAST_CL_COMMIT}..HEAD" --no-merges 2>/dev/null || echo "")
else
  COMMITS=$(git log --format="- %s" --no-merges 2>/dev/null | head -50)
fi

# Nothing to add
if [ -z "$COMMITS" ]; then
  exit 0
fi

# Filter out noise (version-only commits, changelog commits)
FILTERED=$(echo "$COMMITS" | grep -v "^- v[0-9]" | grep -v "^- docs: add v" | grep -v "^- Merge" || true)

# If all commits were filtered, use originals
if [ -z "$FILTERED" ]; then
  FILTERED="$COMMITS"
fi

# Build new entry
ENTRY="## v${PKG_VERSION} (${TODAY})

${FILTERED}
"

# Prepend to existing changelog (or create new)
if [ -f "$CHANGELOG" ]; then
  EXISTING=$(cat "$CHANGELOG")
  printf '%s\n\n%s\n' "$ENTRY" "$EXISTING" > "$CHANGELOG"
else
  printf '%s\n' "$ENTRY" > "$CHANGELOG"
fi

# Stage the updated changelog
if git rev-parse --git-dir > /dev/null 2>&1; then
  git add "$CHANGELOG" 2>/dev/null || true
fi

echo "gen-changelog: added v${PKG_VERSION} entry"
