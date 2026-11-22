#!/usr/bin/env bash
# Reliable graphify entrypoint for Cursor agents and CI.
# graphify is installed via uv at ~/.local/bin/graphify — that dir is often missing from PATH.
set -euo pipefail

GRAPHIFY_BIN="${GRAPHIFY_BIN:-}"
if [[ -z "${GRAPHIFY_BIN}" ]]; then
  if command -v graphify >/dev/null 2>&1; then
    GRAPHIFY_BIN="$(command -v graphify)"
  elif [[ -x "${HOME}/.local/bin/graphify" ]]; then
    GRAPHIFY_BIN="${HOME}/.local/bin/graphify"
  else
    echo "graphify: not found. Install with: uv tool install graphifyy" >&2
    echo "Then ensure ~/.local/bin is on PATH (see docs/GRAPHIFY.md)." >&2
    exit 127
  fi
fi

exec "${GRAPHIFY_BIN}" "$@"
