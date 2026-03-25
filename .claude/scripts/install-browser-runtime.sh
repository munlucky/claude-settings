#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOCAL_BROWSERCTL="${ROOT_DIR}/.claude/bin/browserctl"
TARGET_BIN_DIR="${HOME}/.local/bin"
TARGET_LINK="${TARGET_BIN_DIR}/browserctl"
TARGET_ENV_FILE="${TARGET_BIN_DIR}/env"

usage() {
  cat <<EOF
Usage:
  install-browser-runtime.sh [--bin-dir <dir>] [--force]

Default target:
  ${TARGET_LINK}
EOF
}

write_env_file() {
  cat >"$TARGET_ENV_FILE" <<EOF
#!/usr/bin/env sh
case ":\$PATH:" in
  *:"${TARGET_BIN_DIR}":*)
    ;;
  *)
    export PATH="${TARGET_BIN_DIR}:\$PATH"
    ;;
esac
EOF
  chmod 0644 "$TARGET_ENV_FILE"
}

ensure_profile_sources_env() {
  local profile_path="$1"
  local source_line=". \"${TARGET_ENV_FILE}\""

  if [ ! -f "$profile_path" ]; then
    touch "$profile_path"
  fi

  if ! grep -Fq "$source_line" "$profile_path"; then
    printf '\n# Ensure browser runtime binaries are available\n%s\n' "$source_line" >>"$profile_path"
  fi
}

FORCE=false

while [ $# -gt 0 ]; do
  case "$1" in
    --bin-dir)
      TARGET_BIN_DIR="$2"
      TARGET_LINK="${TARGET_BIN_DIR}/browserctl"
      TARGET_ENV_FILE="${TARGET_BIN_DIR}/env"
      shift 2
      ;;
    --bin-dir=*)
      TARGET_BIN_DIR="${1#*=}"
      TARGET_LINK="${TARGET_BIN_DIR}/browserctl"
      TARGET_ENV_FILE="${TARGET_BIN_DIR}/env"
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
  if [ -L "$TARGET_LINK" ] && [ "$(readlink "$TARGET_LINK")" = "$LOCAL_BROWSERCTL" ]; then
    echo "browserctl already linked at ${TARGET_LINK}"
  elif [ "$FORCE" = true ]; then
    rm -f "$TARGET_LINK"
  else
    echo "Target already exists: ${TARGET_LINK}" >&2
    echo "Re-run with --force to replace it." >&2
    exit 65
  fi
fi

if [ ! -L "$TARGET_LINK" ] || [ "$(readlink "$TARGET_LINK")" != "$LOCAL_BROWSERCTL" ]; then
  ln -s "$LOCAL_BROWSERCTL" "$TARGET_LINK"
  echo "Installed browserctl -> ${TARGET_LINK}"
fi

write_env_file
ensure_profile_sources_env "${HOME}/.zprofile"
ensure_profile_sources_env "${HOME}/.bash_profile"
ensure_profile_sources_env "${HOME}/.profile"
echo "Installed PATH env helper -> ${TARGET_ENV_FILE}"

if command -v browserctl >/dev/null 2>&1; then
  echo "Resolved on PATH: $(command -v browserctl)"
else
  cat <<'EOF'
browserctl is installed, but the current shell does not resolve it on PATH.
Open a new login shell or source ~/.local/bin/env manually.
EOF
fi
