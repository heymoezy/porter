#!/usr/bin/env bash
set -euo pipefail
D2=${D2_BIN:-/home/lobster/.local/bin/d2}
BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
IN="$BASE_DIR/porter-system-map.d2"
OUT_SVG="$BASE_DIR/porter-system-map.svg"
OUT_PDF="$BASE_DIR/porter-system-map.pdf"

"$D2" "$IN" "$OUT_SVG"
"$D2" "$IN" "$OUT_PDF"

echo "Generated:"
echo "  $OUT_SVG"
echo "  $OUT_PDF"
