#!/usr/bin/env bash

set -euo pipefail

if [[ "$#" -lt 1 ]]; then
    echo "Usage: $0 <verification-run-id> [extra args...]" >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIRECT_SCRIPT="${SCRIPT_DIR}/verify-changes.sh"

if [[ -f "$DIRECT_SCRIPT" ]]; then
    exec bash "$DIRECT_SCRIPT" "$@"
fi

declare -a roots=()
declare -a seen=()

collect_roots() {
    local current="$1"

    while [[ -n "$current" ]]; do
        if [[ "$current" == "." ]]; then
            current="$(pwd)"
        fi
        if [[ -z "$current" || "$current" == "/" ]]; then
            roots+=("/")
            break
        fi
        local already=0
        local existing
        for existing in "${seen[@]:-}"; do
            if [[ "$existing" == "$current" ]]; then
                already=1
                break
            fi
        done
        if [[ "$already" -eq 0 ]]; then
            roots+=("$current")
            seen+=("$current")
        fi
        local parent
        parent="$(dirname "$current")"
        if [[ "$parent" == "$current" ]]; then
            break
        fi
        current="$parent"
    done
}

if [[ -n "${WORKSPACE_ROOT:-}" ]]; then
    collect_roots "${WORKSPACE_ROOT}"
fi
collect_roots "$(pwd)"
collect_roots "$SCRIPT_DIR"

verification_script=""
for root in "${roots[@]}"; do
    candidate="${root}/.claude/agents/verification/verify-changes.sh"
    if [[ -f "$candidate" ]]; then
        verification_script="$candidate"
        break
    fi
done

if [[ -z "$verification_script" ]]; then
    echo "VERIFICATION_COMMAND_MISSING: unable to locate .claude/agents/verification/verify-changes.sh." >&2
    echo "Checked ${#roots[@]} candidate root paths." >&2
    exit 2
fi

exec bash "$verification_script" "$@"
