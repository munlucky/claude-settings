#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Keep this entrypoint as a thin wrapper. The executable contract lives in the
# Node wrapper plus shell core; stale generated fixture bodies must not be
# appended here because phase workers may inspect this file during failures.
exec node "$SCRIPT_DIR/verify-phase-runtime-parity.mjs" "$@"