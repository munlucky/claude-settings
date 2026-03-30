#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF_USAGE'
Usage:
  harness-prepare-recursive-worktree.sh [--branch <name>] [--worktree <path>] [--base <branch>]
EOF_USAGE
}

resolve_root_dir() {
  if common_dir="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" && [ -n "$common_dir" ]; then
    cd "$common_dir/.." && pwd
    return 0
  fi

  if [ -f "./.claude/CLAUDE.md" ] || [ -f "./AGENTS.md" ]; then
    pwd
    return 0
  fi

  printf 'ERROR: unable to locate repository root\n' >&2
  exit 1
}

ROOT_DIR="$(resolve_root_dir)"
BRANCH_NAME="${HARNESS_RECURSIVE_BRANCH:-codex/harness-recursive}"
WORKTREE_PATH="${HARNESS_RECURSIVE_WORKTREE:-$ROOT_DIR/.tmp/harness-worktrees/harness-recursive}"
BASE_BRANCH="${HARNESS_RECURSIVE_BASE_BRANCH:-main}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)
      BRANCH_NAME="$2"
      shift 2
      ;;
    --worktree)
      WORKTREE_PATH="$2"
      shift 2
      ;;
    --base)
      BASE_BRANCH="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      printf 'ERROR: unknown option: %s\n' "$1" >&2
      usage
      exit 1
      ;;
  esac
done

case "$WORKTREE_PATH" in
  /*) ;;
  *) WORKTREE_PATH="$ROOT_DIR/$WORKTREE_PATH" ;;
esac

if [ -e "$WORKTREE_PATH" ]; then
  if git -C "$WORKTREE_PATH" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    printf 'Recursive worktree ready\n'
    printf 'Branch: %s\n' "$(git -C "$WORKTREE_PATH" branch --show-current)"
    printf 'Path: %s\n' "$WORKTREE_PATH"
    exit 0
  fi

  printf 'ERROR: path exists but is not a git worktree: %s\n' "$WORKTREE_PATH" >&2
  exit 1
fi

mkdir -p "$(dirname "$WORKTREE_PATH")"

if git -C "$ROOT_DIR" show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
  git -C "$ROOT_DIR" worktree add "$WORKTREE_PATH" "$BRANCH_NAME"
else
  git -C "$ROOT_DIR" worktree add -b "$BRANCH_NAME" "$WORKTREE_PATH" "$BASE_BRANCH"
fi

printf 'Recursive worktree created\n'
printf 'Branch: %s\n' "$BRANCH_NAME"
printf 'Base: %s\n' "$BASE_BRANCH"
printf 'Path: %s\n' "$WORKTREE_PATH"
