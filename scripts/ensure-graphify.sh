#!/usr/bin/env bash
# Bootstrap graphify for this repo: Cursor rule + fresh graphify-out/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GRAPHIFY="${SCRIPT_DIR}/graphify.sh"

if ! "${GRAPHIFY}" version >/dev/null 2>&1; then
  echo "graphify is not installed. Run: uv tool install graphifyy" >&2
  exit 1
fi

echo "Installing Cursor rule (.cursor/rules/graphify.mdc)..."
"${GRAPHIFY}" install --platform cursor

if [[ -f graphify-out/graph.json ]]; then
  echo "Updating knowledge graph (AST-only)..."
  "${GRAPHIFY}" update .
else
  echo "No graph yet — run: ./scripts/graphify.sh ."
  echo "Or for incremental from existing extraction: ./scripts/graphify.sh update ."
fi

echo "Done. Use: ./scripts/graphify.sh query \"<question>\""
