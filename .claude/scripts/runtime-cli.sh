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

runtime_cli_active_workspace_contract() {
  if [[ -f ".claude/CLAUDE.md" ]]; then
    printf '%s\n' ".claude/CLAUDE.md"
    return 0
  fi

  if [[ -f "CLAUDE.md" ]]; then
    printf '%s\n' "CLAUDE.md"
    return 0
  fi

  printf '%s\n' ".claude/CLAUDE.md"
}

runtime_cli_find_pids_by_pattern() {
  local pattern="$1"
  local ps_output=""

  if ! ps_output="$(ps -ax -o pid= -o command= 2>/dev/null)"; then
    return 0
  fi

  awk -v p="$pattern" '$0 ~ p {print $1}' <<< "$ps_output"
}

runtime_cli_append_codex_base_args() {
  local array_name="$1"
  local cwd="$2"
  local use_oss="${CODEX_USE_OSS_PROVIDER:-auto}"
  local local_provider="${CODEX_LOCAL_PROVIDER:-}"
  local use_ephemeral="${CODEX_EXEC_EPHEMERAL:-true}"
  local cwd_q
  local provider_q

  printf -v cwd_q '%q' "$cwd"
  eval "$array_name+=(codex exec --full-auto -C $cwd_q)"

  if [[ "$use_ephemeral" == "true" ]]; then
    eval "$array_name+=(--ephemeral)"
  fi

  if [[ "$use_oss" == "auto" ]]; then
    if [[ -n "$local_provider" ]]; then
      use_oss="true"
    else
      use_oss="false"
    fi
  fi

  if [[ "$use_oss" == "true" ]]; then
    if [[ -z "$local_provider" ]]; then
      local_provider="ollama"
    fi
    printf -v provider_q '%q' "$local_provider"
    eval "$array_name+=(--oss --local-provider $provider_q)"
  fi
}
