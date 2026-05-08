#!/usr/bin/env bash
set -euo pipefail

mode="${1:-status}"
shift || true
repo_root="$(git -c "safe.directory=*" rev-parse --show-toplevel 2>/dev/null || pwd)"
git_safe=(git -c "safe.directory=$repo_root" -c core.editor=true)
export GIT_EDITOR="${GIT_EDITOR:-true}"

case "$mode" in
  status)
    "${git_safe[@]}" status --short "$@" | head -40
    ;;
  diff-stat)
    "${git_safe[@]}" diff --stat "$@" | head -40
    ;;
  staged-stat)
    "${git_safe[@]}" diff --cached --stat "$@" | head -40
    ;;
  log)
    "${git_safe[@]}" log --oneline -10 "$@"
    ;;
  changed-files)
    "${git_safe[@]}" diff --name-only "$@" | head -80
    ;;
  *)
    echo "Usage: $0 {status|diff-stat|staged-stat|log|changed-files} [git args...]" >&2
    exit 64
    ;;
esac
