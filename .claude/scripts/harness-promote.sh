#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF_USAGE'
Usage:
  harness-promote.sh [--source <branch>] [--target <branch>] [--target-base <branch>] [--paths-file <file>] [--target-worktree <path>] [--skip-checks] [--allow-main-target]
EOF_USAGE
}

resolve_root_dir() {
  if git_root="$(git rev-parse --show-toplevel 2>/dev/null)" && [ -n "$git_root" ]; then
    printf '%s\n' "$git_root"
    return 0
  fi

  printf 'ERROR: unable to locate repository root\n' >&2
  exit 1
}

resolve_common_root_dir() {
  if common_dir="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" && [ -n "$common_dir" ]; then
    cd "$common_dir/.." && pwd
    return 0
  fi

  printf 'ERROR: unable to locate common git root\n' >&2
  exit 1
}

find_worktree_for_branch() {
  local repo_root="$1"
  local branch_name="$2"
  local branch_ref="refs/heads/$branch_name"
  local current_path=""
  local current_branch=""

  while IFS= read -r line; do
    case "$line" in
      worktree\ *)
        current_path="${line#worktree }"
        ;;
      branch\ *)
        current_branch="${line#branch }"
        if [ "$current_branch" = "$branch_ref" ]; then
          printf '%s\n' "$current_path"
          return 0
        fi
        ;;
      "")
        current_path=""
        current_branch=""
        ;;
    esac
  done < <(git -C "$repo_root" worktree list --porcelain)

  return 1
}

copy_path_spec() {
  local source_root="$1"
  local target_root="$2"
  local path_spec="$3"
  local source_path="$source_root/$path_spec"
  local target_path="$target_root/$path_spec"

  mkdir -p "$(dirname "$target_path")"
  rm -rf "$target_path"

  if [ -e "$source_path" ]; then
    cp -R "$source_path" "$target_path"
  fi
}

ensure_target_worktree() {
  local repo_root="$1"
  local target_branch="$2"
  local target_base="$3"
  local target_worktree="$4"

  if git -C "$target_worktree" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    printf '%s\n' "$target_worktree"
    return 0
  fi

  if [ -e "$target_worktree" ]; then
    printf 'ERROR: target path exists but is not a git worktree: %s\n' "$target_worktree" >&2
    exit 1
  fi

  mkdir -p "$(dirname "$target_worktree")"

  if git -C "$repo_root" show-ref --verify --quiet "refs/heads/$target_branch"; then
    git -C "$repo_root" worktree add "$target_worktree" "$target_branch" >/dev/null
  else
    git -C "$repo_root" worktree add -b "$target_branch" "$target_worktree" "$target_base" >/dev/null
  fi

  printf '%s\n' "$target_worktree"
}

sync_target_to_base() {
  local target_worktree="$1"
  local target_base="$2"
  local paths_file="$3"
  local path_spec=""

  while IFS= read -r path_spec || [ -n "$path_spec" ]; do
    path_spec="${path_spec%%#*}"
    path_spec="${path_spec%"${path_spec##*[![:space:]]}"}"
    path_spec="${path_spec#"${path_spec%%[![:space:]]*}"}"
    [ -n "$path_spec" ] || continue
    git -C "$target_worktree" restore --source "$target_base" --worktree -- "$path_spec" 2>/dev/null || true
  done < "$paths_file"
}

run_required_checks() {
  local worktree="$1"

  (
    cd "$worktree"
    bash .claude/scripts/knowledge-repo-audit.sh
    bash .claude/scripts/verify-code-policy.sh
    bash .claude/scripts/workflow-enforcement.sh verify
    bash -n .claude/scripts/knowledge-repo-audit.sh
    bash -n .claude/scripts/verify-code-policy.sh
    bash -n .claude/scripts/workflow-enforcement.sh
    bash -n .claude/scripts/agent-loop.sh
    bash -n .claude/scripts/moonshot-phase-dispatch.sh
    bash -n .claude/scripts/verify-phase-runtime-parity.sh
    bash -n .claude/agents/verification/verify-changes.sh
    bash -n .claude/agents/verification/verify-runtime.sh
    bash .claude/scripts/verify-phase-runtime-parity.sh .claude/docs/runtime-parity-reference-plan
  )
}

WORKSPACE_ROOT="$(resolve_root_dir)"
COMMON_ROOT="$(resolve_common_root_dir)"
SOURCE_BRANCH="${HARNESS_RECURSIVE_BRANCH:-codex/harness-recursive}"
TARGET_BRANCH="${HARNESS_CANDIDATE_BRANCH:-codex/harness-main-candidate}"
TARGET_BASE_BRANCH="${HARNESS_CANDIDATE_BASE_BRANCH:-main}"
PATHS_FILE="${HARNESS_PROMOTION_PATHS_FILE:-$WORKSPACE_ROOT/.claude/harness-promotion-paths.txt}"
TARGET_WORKTREE="${HARNESS_CANDIDATE_WORKTREE:-$COMMON_ROOT/.tmp/harness-worktrees/harness-main-candidate}"
SKIP_CHECKS="${HARNESS_PROMOTION_SKIP_CHECKS:-false}"
ALLOW_MAIN_TARGET="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source)
      SOURCE_BRANCH="$2"
      shift 2
      ;;
    --target)
      TARGET_BRANCH="$2"
      shift 2
      ;;
    --target-base)
      TARGET_BASE_BRANCH="$2"
      shift 2
      ;;
    --paths-file)
      PATHS_FILE="$2"
      shift 2
      ;;
    --target-worktree)
      TARGET_WORKTREE="$2"
      shift 2
      ;;
    --skip-checks)
      SKIP_CHECKS="true"
      shift
      ;;
    --allow-main-target)
      ALLOW_MAIN_TARGET="true"
      shift
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

case "$PATHS_FILE" in
  /*) ;;
  *) PATHS_FILE="$WORKSPACE_ROOT/$PATHS_FILE" ;;
esac

case "$TARGET_WORKTREE" in
  /*) ;;
  *) TARGET_WORKTREE="$COMMON_ROOT/$TARGET_WORKTREE" ;;
esac

if ! git -C "$COMMON_ROOT" rev-parse --verify "$SOURCE_BRANCH^{commit}" >/dev/null 2>&1; then
  printf 'ERROR: source branch not found: %s\n' "$SOURCE_BRANCH" >&2
  exit 1
fi

if [ "$(git -C "$WORKSPACE_ROOT" branch --show-current)" != "$SOURCE_BRANCH" ]; then
  printf 'ERROR: current worktree is not on source branch %s: %s\n' "$SOURCE_BRANCH" "$WORKSPACE_ROOT" >&2
  exit 1
fi

if [ ! -f "$PATHS_FILE" ]; then
  printf 'ERROR: promotion paths file not found: %s\n' "$PATHS_FILE" >&2
  exit 1
fi

if [ "$TARGET_BRANCH" = "main" ] && [ "$ALLOW_MAIN_TARGET" != "true" ]; then
  printf 'ERROR: refusing to target main without --allow-main-target\n' >&2
  exit 1
fi

if target_from_branch="$(find_worktree_for_branch "$COMMON_ROOT" "$TARGET_BRANCH")"; then
  TARGET_WORKTREE="$target_from_branch"
else
  TARGET_WORKTREE="$(ensure_target_worktree "$COMMON_ROOT" "$TARGET_BRANCH" "$TARGET_BASE_BRANCH" "$TARGET_WORKTREE")"
fi

if ! git -C "$TARGET_WORKTREE" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  printf 'ERROR: target worktree is invalid: %s\n' "$TARGET_WORKTREE" >&2
  exit 1
fi

if [ "$(git -C "$TARGET_WORKTREE" branch --show-current)" != "$TARGET_BRANCH" ]; then
  printf 'ERROR: target worktree is not on branch %s: %s\n' "$TARGET_BRANCH" "$TARGET_WORKTREE" >&2
  exit 1
fi

if [ -n "$(git -C "$TARGET_WORKTREE" status --short)" ]; then
  printf 'ERROR: target worktree is dirty: %s\n' "$TARGET_WORKTREE" >&2
  exit 1
fi

sync_target_to_base "$TARGET_WORKTREE" "$TARGET_BASE_BRANCH" "$PATHS_FILE"

while IFS= read -r path_spec || [ -n "$path_spec" ]; do
  path_spec="${path_spec%%#*}"
  path_spec="${path_spec%"${path_spec##*[![:space:]]}"}"
  path_spec="${path_spec#"${path_spec%%[![:space:]]*}"}"
  [ -n "$path_spec" ] || continue
  copy_path_spec "$WORKSPACE_ROOT" "$TARGET_WORKTREE" "$path_spec"
done < "$PATHS_FILE"

if [ -z "$(git -C "$TARGET_WORKTREE" status --short)" ]; then
  printf 'No promotable changes found between %s and %s\n' "$SOURCE_BRANCH" "$TARGET_BRANCH"
  exit 0
fi

if [ "$SKIP_CHECKS" != "true" ]; then
  run_required_checks "$TARGET_WORKTREE"
fi

printf 'Promotion candidate prepared\n'
printf 'Source branch: %s\n' "$SOURCE_BRANCH"
printf 'Target branch: %s\n' "$TARGET_BRANCH"
printf 'Target base: %s\n' "$TARGET_BASE_BRANCH"
printf 'Target worktree: %s\n' "$TARGET_WORKTREE"
printf 'Working tree status:\n'
git -C "$TARGET_WORKTREE" status --short
