#!/usr/bin/env bash
#
# Compatibility wrapper for the installed runtime entrypoint
# `.claude/scripts/workflow-enforcement.mjs`.
#
# Keep this path stable for downstream `.claude/` payloads during the
# compatibility window. Durable contributor guidance belongs in `docs/public/`.

if [ -z "${BASH_VERSION:-}" ]; then
  echo "workflow-enforcement.sh must be run with Bash. Use: bash .claude/scripts/workflow-enforcement.sh verify" >&2
  exit 64
fi

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/workflow-enforcement.mjs" "$@"
