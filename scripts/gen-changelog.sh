#!/bin/bash
# ─────────────────────────────────────────────────────────────
# gen-changelog.sh — Auto-generate CHANGELOG.md from git history
#
# How it works:
#   1. Reads current version from package.json
#   2. Checks if CHANGELOG.md already has this version
#   3. If not, collects commits since last CHANGELOG.md update
#   4. Generates a new entry and prepends it
#   5. Stages CHANGELOG.md (when run as hook)
#
# Called from:
#   - .git/hooks/pre-commit (auto-stages)
# ─────────────────────────────────────────────────────────────

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PKG_VERSION=$(node -p "require('./package.json').version")
TODAY=$(date +%Y-%m-%d)
CHANGELOG="$ROOT/CHANGELOG.md"

# If CHANGELOG.md has unstaged content changes (developer actively editing it), respect their work.
if git diff --name-only 2>/dev/null | grep -q "^CHANGELOG.md$"; then
  exit 0
fi

# Check if CHANGELOG.md already has this version
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

# Filter out noise (version-only commits, changelog commits, docs-only)
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

# Stage if running in git context (pre-commit hook)
if git rev-parse --git-dir > /dev/null 2>&1; then
  git add "$CHANGELOG" 2>/dev/null || true
fi

echo "gen-changelog: added v${PKG_VERSION} entry"
