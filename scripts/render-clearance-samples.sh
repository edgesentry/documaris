#!/usr/bin/env bash
# Generate sample port cyber clearance HTML for Cap Vista deck (G5).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EDS="${EDS_BIN:-${ROOT}/../edgesentry-rs/target/debug/eds}"
FACTS_DIR="${ROOT}/fixtures/clearance"
OUT_DIR="${ROOT}/dist"
VERIFY_URL="${VERIFY_URL:-https://verify.edgesentry.io/clearance/poc}"

if [[ ! -x "$EDS" ]]; then
  echo "Building eds (set EDS_BIN if installed elsewhere)..." >&2
  (cd "${ROOT}/../edgesentry-rs" && cargo build -p eds)
  EDS="${ROOT}/../edgesentry-rs/target/debug/eds"
fi

mkdir -p "$OUT_DIR"

for facts in "$FACTS_DIR"/*_facts.json; do
  base="$(basename "$facts" _facts.json)"
  out="${OUT_DIR}/${base}_port-cyber-clearance.html"
  "$EDS" document render-clearance \
    --facts "$facts" \
    --verify-url "$VERIFY_URL" \
    --out "$out"
  echo "Wrote $out"
done
