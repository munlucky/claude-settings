#!/usr/bin/env bash
set -euo pipefail

mode="${1:-status}"
shift || true

case "$mode" in
  status)
    git status --short "$@" | head -40
    ;;
  diff-stat)
    git diff --stat "$@" | head -40
    ;;
  staged-stat)
    git diff --cached --stat "$@" | head -40
    ;;
  log)
    git log --oneline -10 "$@"
    ;;
  changed-files)
    git diff --name-only "$@" | head -80
    ;;
  *)
    echo "Usage: $0 {status|diff-stat|staged-stat|log|changed-files} [git args...]" >&2
    exit 64
    ;;
esac
