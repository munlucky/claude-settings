#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOCAL_BROWSERCTL="${ROOT_DIR}/.claude/bin/browserctl"
TARGET_BIN_DIR="${HOME}/.local/bin"
TARGET_LINK="${TARGET_BIN_DIR}/browserctl"

usage() {
  cat <<EOF
Usage:
  install-browser-runtime.sh [--bin-dir <dir>] [--force]

Default target:
  ${TARGET_LINK}
EOF
}

FORCE=false

while [ $# -gt 0 ]; do
  case "$1" in
    --bin-dir)
      TARGET_BIN_DIR="$2"
      TARGET_LINK="${TARGET_BIN_DIR}/browserctl"
      shift 2
      ;;
    --bin-dir=*)
      TARGET_BIN_DIR="${1#*=}"
      TARGET_LINK="${TARGET_BIN_DIR}/browserctl"
      shift
      ;;
    --force)
      FORCE=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 64
      ;;
  esac
done

if [ ! -x "$LOCAL_BROWSERCTL" ]; then
  echo "Missing executable browserctl at ${LOCAL_BROWSERCTL}" >&2
  exit 64
fi

mkdir -p "$TARGET_BIN_DIR"

if [ -e "$TARGET_LINK" ] || [ -L "$TARGET_LINK" ]; then
  if [ "$FORCE" = true ]; then
    rm -f "$TARGET_LINK"
  else
    echo "Target already exists: ${TARGET_LINK}" >&2
    echo "Re-run with --force to replace it." >&2
    exit 65
  fi
fi

ln -s "$LOCAL_BROWSERCTL" "$TARGET_LINK"
echo "Installed browserctl -> ${TARGET_LINK}"

if command -v browserctl >/dev/null 2>&1; then
  echo "Resolved on PATH: $(command -v browserctl)"
else
  cat <<'EOF'
browserctl is installed, but the current shell does not resolve it on PATH.
For zsh/bash, ensure ~/.local/bin is on PATH. This machine already has ~/.local/bin/env available.
EOF
fi
