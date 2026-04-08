#!/usr/bin/env bash

set -euo pipefail

RUNTIME_CLI_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_CLI_NODE_MODULE="${RUNTIME_CLI_SCRIPT_DIR}/runtime-cli.mjs"

runtime_cli_run_node() {
  node "$RUNTIME_CLI_NODE_MODULE" "$@"
}

runtime_cli_append_lines_to_array() {
  local array_name="$1"
  shift
  local -a lines=("$@")
  local line
  local escaped=""

  for line in "${lines[@]}"; do
    printf -v escaped '%s %q' "$escaped" "$line"
  done

  if [[ -n "$escaped" ]]; then
    eval "$array_name+=($escaped)"
  fi
}

runtime_cli_is_wsl() {
  runtime_cli_run_node is-wsl
}

runtime_cli_find_windows_codex_auth() {
  runtime_cli_run_node find-windows-codex-auth
}

runtime_cli_sync_wsl_codex_auth() {
  runtime_cli_run_node sync-wsl-codex-auth >/dev/null
}

runtime_cli_prepare_environment() {
  runtime_cli_sync_wsl_codex_auth
}

runtime_cli_active_workspace_contract() {
  runtime_cli_run_node active-workspace-contract "${1:-$PWD}"
}

runtime_cli_find_pids_by_pattern() {
  runtime_cli_run_node find-pids-by-pattern "$1"
}

runtime_cli_append_codex_base_args() {
  local array_name="$1"
  local cwd="$2"
  local -a resolved_args=()
  local line

  while IFS= read -r line; do
    resolved_args+=("$line")
  done < <(runtime_cli_run_node codex-base-args "$cwd")

  runtime_cli_append_lines_to_array "$array_name" "${resolved_args[@]}"
}
