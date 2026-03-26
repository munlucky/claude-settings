#!/usr/bin/env bash

runtime_cli_is_wsl() {
  grep -qi microsoft /proc/version 2>/dev/null || grep -qi microsoft /proc/sys/kernel/osrelease 2>/dev/null
}

runtime_cli_find_windows_codex_auth() {
  local candidate=""
  local user_hint="${WIN_USERNAME:-${USERNAME:-${USER:-}}}"
  local -a candidates=()

  if [[ -n "$user_hint" ]]; then
    candidates+=("/mnt/c/Users/${user_hint}/.codex/auth.json")
  fi

  candidates+=(
    "/mnt/c/Users/moon/.codex/auth.json"
    "/mnt/c/Users/${USER}/.codex/auth.json"
  )

  for candidate in "${candidates[@]}"; do
    if [[ -s "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  while IFS= read -r candidate; do
    if [[ -s "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done < <(compgen -G '/mnt/c/Users/*/.codex/auth.json' || true)

  return 1
}

runtime_cli_sync_wsl_codex_auth() {
  local local_codex_dir="${HOME}/.codex"
  local local_auth="${local_codex_dir}/auth.json"
  local windows_auth=""

  if ! runtime_cli_is_wsl; then
    return 0
  fi

  if [[ -s "$local_auth" ]]; then
    return 0
  fi

  if ! windows_auth="$(runtime_cli_find_windows_codex_auth)"; then
    return 0
  fi

  mkdir -p "$local_codex_dir"
  rm -f "$local_auth"

  if ! ln -s "$windows_auth" "$local_auth" 2>/dev/null; then
    cp "$windows_auth" "$local_auth"
  fi
}

runtime_cli_prepare_environment() {
  runtime_cli_sync_wsl_codex_auth
}
