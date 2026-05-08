#!/usr/bin/env bash
if [ -z "${BASH_VERSION:-}" ]; then
  echo "workflow-enforcement.sh must be run with Bash. Use: bash .claude/scripts/workflow-enforcement.sh verify" >&2
  exit 64
fi

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/workflow-enforcement.mjs" "$@"
