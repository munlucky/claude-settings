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
  raw-diff)
    if [[ "$#" -eq 0 ]]; then
      echo "raw-diff requires an explicit path limit, for example: $0 raw-diff -- <path>" >&2
      exit 64
    fi
    has_path_limit=false
    after_double_dash=false
    for arg in "$@"; do
      if [[ "$after_double_dash" == true ]]; then
        [[ -n "$arg" ]] && has_path_limit=true
        continue
      fi
      if [[ "$arg" == "--" ]]; then
        after_double_dash=true
        continue
      fi
      if [[ "$arg" != -* ]]; then
        has_path_limit=true
      fi
    done
    if [[ "$has_path_limit" != true ]]; then
      echo "raw-diff refuses unbounded output; pass a pathspec such as: $0 raw-diff -- <path>" >&2
      exit 64
    fi
    "${git_safe[@]}" diff "$@" | head -200
    ;;
  *)
    echo "Usage: $0 {status|diff-stat|staged-stat|log|changed-files|raw-diff} [git args...]" >&2
    exit 64
    ;;
esac
