#!/usr/bin/env bash
#
# Compatibility wrapper for the installed runtime entrypoint
# `.claude/scripts/moonshot-phase-dispatch.mjs`.
#
# Canonical contributor docs live under `docs/public/`; this shell entrypoint
# remains for downstream `.claude/` installs until a later major version
# announces a replacement command.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/moonshot-phase-dispatch.mjs" "$@"
