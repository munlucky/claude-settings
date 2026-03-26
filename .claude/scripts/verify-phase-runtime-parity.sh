#!/usr/bin/env bash

# Runtime parity smoke for Moonshot phase execution.
# Coverage:
#   - render matrix for delegated-terminal and in-session-coordinator across Claude/Codex
#   - runtime availability probes for Claude/Codex
#   - actual delegated-terminal + in-session-coordinator runs for each available runtime
#   - artifact/status/verdict assertions after each actual run

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
REFERENCE_PLAN_DIR="docs/implementation"
RUN_REAL=true
TMP_ROOT="$(mktemp -d)"
KEEP_TMP="${PHASE_RUNTIME_PARITY_KEEP_TMP:-false}"
CLAUDE_AVAILABLE=false
CODEX_AVAILABLE=false
RUNTIME_FAILURES=()
ACTUAL_FAILURES=()

cleanup() {
  if [[ "$KEEP_TMP" == "true" ]]; then
    log "keeping temp artifacts: $TMP_ROOT"
    return
  fi
  rm -rf "$TMP_ROOT"
}

trap cleanup EXIT

usage() {
  cat <<'EOF_USAGE'
Usage:
  verify-phase-runtime-parity.sh [reference-plan-dir] [--render-only]
EOF_USAGE
}

log() {
  printf '%s\n' "$1"
}

warn() {
  printf 'WARN: %s\n' "$1"
}

fail() {
  log "$1"
  if [[ "$KEEP_TMP" == "true" ]]; then
    log "debug temp root: $TMP_ROOT"
  fi
  exit 1
}

require_command() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    fail "missing command: $name"
  fi
}

assert_contains() {
  local file="$1"
  local pattern="$2"
  local description="$3"
  if ! grep -Fq -- "$pattern" "$file"; then
    fail "missing ${description}: ${pattern}"
  fi
}

checksum_file() {
  shasum "$1" | awk '{print $1}'
}

snapshot_git_status() {
  local repo_root="$1"
  local output_file="$2"
  if (cd "$repo_root" && git rev-parse --is-inside-work-tree >/dev/null 2>&1); then
    (cd "$repo_root" && git status --porcelain --untracked-files=all > "$output_file")
  else
    : > "$output_file"
  fi
}

assert_allowed_git_changes() {
  local before_file="$1"
  local after_file="$2"

  python3 - "$before_file" "$after_file" <<'PY'
import sys

before_path, after_path = sys.argv[1:]
allowed_prefixes = (
    ".claude/logs/agent-loop/",
    ".claude/memory.json",
    ".claude/verification-results-",
    ".claude/verification-verdict-",
    ".claude/runtime-verdict-",
    "runtime-parity-fixtures/",
)


def parse_status(path):
    result = {}
    with open(path, "r", encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.rstrip("\n")
            if not line:
                continue
            status = line[:2]
            payload = line[3:]
            if " -> " in payload:
                payload = payload.split(" -> ", 1)[1]
            result[payload] = status
    return result


before = parse_status(before_path)
after = parse_status(after_path)

violations = []
for path, status in after.items():
    if before.get(path) == status:
      continue
    if path.startswith(allowed_prefixes):
      continue
    violations.append(f"{status} {path}")

if violations:
    print("unexpected git changes detected:")
    for item in violations:
        print(item)
    sys.exit(1)
PY
}

latest_new_file() {
  local repo_root="$1"
  local pattern="$2"
  local sentinel="$3"
  find "$repo_root/.claude" -maxdepth 1 -name "$pattern" -newer "$sentinel" -print | sort | tail -1
}

record_runtime_failure() {
  local runtime="$1"
  local detail="$2"
  RUNTIME_FAILURES+=("${runtime}: ${detail}")
}

record_actual_failure() {
  local scenario_name="$1"
  local detail="$2"
  ACTUAL_FAILURES+=("${scenario_name}: ${detail}")
}

runtime_is_available() {
  local runtime="$1"
  case "$runtime" in
    claude)
      [[ "$CLAUDE_AVAILABLE" == "true" ]]
      ;;
    codex)
      [[ "$CODEX_AVAILABLE" == "true" ]]
      ;;
    *)
      return 1
      ;;
  esac
}

summarize_probe_detail() {
  local primary_file="$1"
  local secondary_file="${2:-}"

  python3 - "$primary_file" "$secondary_file" <<'PY'
import pathlib
import sys

lines = []
for path in sys.argv[1:]:
    if not path:
        continue
    candidate = pathlib.Path(path)
    if not candidate.exists():
        continue
    for raw_line in candidate.read_text(encoding="utf-8", errors="replace").splitlines():
        stripped = raw_line.strip()
        if stripped:
            lines.append(stripped)

if not lines:
    raise SystemExit(0)

summary = " | ".join(lines[-6:])
print(summary[:600])
PY
}

prepare_workspace_copy() {
  local workspace_root="$1"

  mkdir -p "$workspace_root"
  (
    cd "$REPO_ROOT"
    tar \
      --exclude='./.git' \
      --exclude='./.tmp' \
      --exclude='./.claude/logs' \
      --exclude='./.claude/memory.json' \
      --exclude='./.claude/verification-results-*' \
      --exclude='./.claude/verification-verdict-*' \
      --exclude='./.claude/runtime-verdict-*' \
      --exclude='./.claude/knowledge-repo-audit-*' \
      -cf - .
  ) | (
    cd "$workspace_root"
    tar -xf -
  )
}

initialize_workspace_git() {
  local workspace_root="$1"
  (
    cd "$workspace_root"
    git init -q
    git config user.name "runtime-parity"
    git config user.email "runtime-parity@example.invalid"
    git add -A
    git commit -qm "runtime parity baseline"
  )
}

probe_claude_runtime() {
  local output_file="$TMP_ROOT/claude-probe.out"
  local error_file="$TMP_ROOT/claude-probe.err"
  local detail

  set +e
  (
    cd "$REPO_ROOT"
    claude --dangerously-skip-permissions --no-session-persistence --disable-slash-commands --tools "" \
      -p 'Reply exactly with RUNTIME_OK and nothing else.'
  ) >"$output_file" 2>"$error_file"
  local exit_code=$?
  set -e

  if grep -Fxq "RUNTIME_OK" "$output_file"; then
    CLAUDE_AVAILABLE=true
    log "runtime probe passed: claude"
    return 0
  fi

  detail="$(summarize_probe_detail "$error_file" "$output_file")"
  if grep -Fqi "does not have access to Claude" "$error_file" "$output_file"; then
    record_runtime_failure "claude" "organization/account access unavailable (${detail:-no additional detail})"
  elif grep -Fqi "Please login again" "$error_file" "$output_file"; then
    record_runtime_failure "claude" "login required (${detail:-no additional detail})"
  elif grep -Fqi "Could not resolve authentication method" "$error_file" "$output_file"; then
    record_runtime_failure "claude" "authentication token unavailable (${detail:-no additional detail})"
  elif [[ $exit_code -eq 0 && ! -s "$output_file" && ! -s "$error_file" ]]; then
    record_runtime_failure "claude" "CLI returned no output; verify auth and org access"
  else
    record_runtime_failure "claude" "${detail:-probe exited with code ${exit_code}}"
  fi

  return 1
}

probe_codex_runtime() {
  local output_file="$TMP_ROOT/codex-probe.out"
  local stdout_file="$TMP_ROOT/codex-probe.stdout"
  local error_file="$TMP_ROOT/codex-probe.err"
  local detail

  set +e
  (
    cd "$REPO_ROOT"
    codex exec --full-auto -C "$REPO_ROOT" -o "$output_file" \
      'Reply exactly with RUNTIME_OK and nothing else.'
  ) >"$stdout_file" 2>"$error_file"
  local exit_code=$?
  set -e

  if grep -Fxq "RUNTIME_OK" "$output_file"; then
    CODEX_AVAILABLE=true
    log "runtime probe passed: codex"
    return 0
  fi

  detail="$(summarize_probe_detail "$error_file" "$stdout_file")"
  if grep -Fqi ".codex/sessions" "$error_file" "$stdout_file" && grep -Fqi "permission denied" "$error_file" "$stdout_file"; then
    record_runtime_failure "codex" "session storage is not writable (${detail:-no additional detail})"
  elif grep -Fqi "error sending request for url" "$error_file" "$stdout_file" || grep -Fqi "network error" "$error_file" "$stdout_file"; then
    record_runtime_failure "codex" "network access unavailable (${detail:-no additional detail})"
  elif grep -Fqi "login" "$error_file" "$stdout_file" && grep -Fqi "codex" "$error_file" "$stdout_file"; then
    record_runtime_failure "codex" "login required (${detail:-no additional detail})"
  else
    record_runtime_failure "codex" "${detail:-probe exited with code ${exit_code}}"
  fi

  return 1
}

run_runtime_probes() {
  probe_claude_runtime || warn "runtime probe failed: claude"
  probe_codex_runtime || warn "runtime probe failed: codex"
}

assert_passed_verdict() {
  local verdict_file="$1"
  python3 - "$verdict_file" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    payload = json.load(handle)

if payload.get("verdict") != "passed":
    raise SystemExit(f"verdict not passed: {payload.get('verdict')}")
PY
}

seed_fixture() {
  local fixture_root="$1"
  local scenario_name="$2"
  local execution_mode="$3"

  local plan_dir="$fixture_root/plan"
  local execution_root="$plan_dir/execution"
  local phase_title="Phase 01: Runtime Smoke"
  local phase_dir="$execution_root/01-phase-01-runtime-smoke"
  local master_plan="$plan_dir/00-master-plan-v1.md"
  local phase_doc="$plan_dir/01-runtime-smoke.md"
  local sprint_contract="$phase_dir/SPRINT_CONTRACT.md"
  local qa_report="$phase_dir/QA_REPORT.md"
  local handoff="$phase_dir/HANDOFF.md"
  local status_file="$fixture_root/phase-status.yaml"

  mkdir -p "$phase_dir"

  cat > "$master_plan" <<EOF
# Runtime Parity Smoke Master Plan

- Phase 01: Runtime Smoke
- Objective: exercise the workflow boundary without modifying repository source files
EOF

  cat > "$phase_doc" <<EOF
# ${phase_title}

## Goal
- Prove that the ${scenario_name} runtime path can execute one full phase attempt and leave fresh verification evidence.

## In Scope
- Update only execution artifacts under ${phase_dir}
- Run verification with:
  - \`HARNESS_OPERATING_MODE=meta_harness VERIFY_CHANGES_SKIP_CHECKS=phaseRuntimeParity bash .claude/agents/verification/verify-changes.sh runtime-smoke-${scenario_name}\`

## Out of Scope
- Editing repository source files outside ${phase_dir}
- Git commits, branch changes, or workflow refactors
- Inspecting unrelated repo docs or the parity harness script itself once the execution contract is clear

## Required Steps
1. Read \`SPRINT_CONTRACT.md\` and keep the policy anchors intact.
2. Refresh only the execution-artifact fields needed for this phase attempt.
3. Record the runtime/mode in \`QA_REPORT.md\`.
4. Run the verification command exactly once for fresh evidence.
5. Read the newest \`.claude/verification-verdict-*.json\` file and record its path and verdict in \`QA_REPORT.md\`.
6. If verification passes, stop immediately after updating the execution artifacts.
7. If verification fails, update \`HANDOFF.md\` and stop without touching repository source files.

## Completion
- \`QA_REPORT.md\` changed during the run
- Fresh verification verdict exists after the run
- \`phase-status.yaml\` marks phase 1 completed
- The attempt stops after the artifact trio is updated

## Context Limits
- Do not inspect \`.claude/scripts/verify-phase-runtime-parity.sh\`; the phase doc and sprint contract already define the pass criteria.
- Do not inspect unrelated repository files after the required verification command is known.
EOF

  cat > "$sprint_contract" <<EOF
# SPRINT CONTRACT

## Slice
- Name: Runtime Smoke
- Owner: Runtime parity verifier
- Source task: ${phase_doc}

## Round Goal
- Exercise the workflow runtime for ${scenario_name} without editing repository source files.

## Non-Goals
- No edits outside ${phase_dir}
- No commits
- No follow-up refactors

## Planned Changes
- Update execution artifacts only

## Execution Refresh
- Refreshed for phase attempt: pending
- Runtime mode: ${execution_mode}
- Phase attempt mode: true
- Execution scope: execution artifacts only for phase 1 runtime smoke
- Verification command: \`HARNESS_OPERATING_MODE=meta_harness VERIFY_CHANGES_SKIP_CHECKS=phaseRuntimeParity bash .claude/agents/verification/verify-changes.sh runtime-smoke-${scenario_name}\`

## Policy Anchors
- Always-loaded rules: AGENTS.md, .claude/CLAUDE.md, .claude/rules/**
- Active workspace contract: .claude/PROJECT.md
- Verification contract: .claude/verification.contract.yaml
- Phase-specific guides: .claude/docs/guidelines/long-running-harness.md
- Round policy summary: runtime smoke only, no repository source edits, fresh verification evidence required

## Done Checks
| Check | Type | Pass Condition |
|-------|------|----------------|
| QA report updated | Docs | QA report mentions ${scenario_name} |
| Fresh verification verdict | Test | verify-changes verdict is passed |
| No source edits | Policy | only execution artifacts changed |

## Evaluator Focus
- Runtime reaches one full phase attempt
- Fresh verification evidence exists
- Repository source files remain untouched
- The attempt stops after updating the artifact trio and does not continue broad repo inspection

## Evidence
- Required commands:
  - HARNESS_OPERATING_MODE=meta_harness VERIFY_CHANGES_SKIP_CHECKS=phaseRuntimeParity bash .claude/agents/verification/verify-changes.sh runtime-smoke-${scenario_name}
- Runtime flow:
  - execute the active phase once
- Screenshots/logs:
  - runtime smoke logs only

## Risks
- CLI authentication/runtime issues
- Unexpected source edits should fail the smoke
EOF

  cat > "$qa_report" <<EOF
# QA REPORT

## Verdict
- Status: pending
- Summary: awaiting runtime execution
EOF

  cat > "$handoff" <<EOF
# HANDOFF

## Goal
- Runtime parity smoke

## Current State
- Completed:
- In progress:
- Blocked:
EOF

  cat > "$status_file" <<EOF
schemaVersion: "1.0"
masterPlan: "${master_plan}"
autonomousMode: true
executionMode: "${execution_mode}"
executionRoot: "${execution_root}"
phases:
  - number: 1
    title: "${phase_title}"
    status: pending
    planConfirmed: true
    attempts:
      total: 0
      lastOutcome: pending
    sprintContract: "${sprint_contract}"
    qaReport: "${qa_report}"
    handoff: "${handoff}"
EOF

  printf '%s\n' "$plan_dir" "$execution_root" "$status_file" "$sprint_contract" "$qa_report" "$handoff"
}

run_render_matrix() {
  local claude_delegated_out="$TMP_ROOT/dispatch-claude-delegated.txt"
  local codex_delegated_out="$TMP_ROOT/dispatch-codex-delegated.txt"
  local claude_coord_out="$TMP_ROOT/dispatch-claude-coordinator.txt"
  local codex_coord_out="$TMP_ROOT/dispatch-codex-coordinator.txt"
  local agent_loop_out="$TMP_ROOT/agent-loop-dry-run.txt"

  (
    cd "$REPO_ROOT"
    bash .claude/scripts/moonshot-phase-dispatch.sh "$REFERENCE_PLAN_DIR" --execution-mode delegated-terminal --runtime claude --dry-run > "$claude_delegated_out"
    bash .claude/scripts/moonshot-phase-dispatch.sh "$REFERENCE_PLAN_DIR" --execution-mode delegated-terminal --runtime codex --dry-run > "$codex_delegated_out"
    bash .claude/scripts/moonshot-phase-dispatch.sh "$REFERENCE_PLAN_DIR" --execution-mode in-session-coordinator --runtime claude --dry-run > "$claude_coord_out"
    bash .claude/scripts/moonshot-phase-dispatch.sh "$REFERENCE_PLAN_DIR" --execution-mode in-session-coordinator --runtime codex --dry-run > "$codex_coord_out"
  )

  assert_contains "$claude_delegated_out" "agent-loop.sh" "delegated-terminal adapter command"
  assert_contains "$claude_delegated_out" "--runtime claude" "Claude delegated runtime flag"
  assert_contains "$codex_delegated_out" "--runtime codex" "Codex delegated runtime flag"
  assert_contains "$claude_coord_out" "claude --dangerously-skip-permissions" "Claude coordinator adapter"
  assert_contains "$claude_coord_out" "/moonshot-in-session-coordinator" "coordinator prompt"
  assert_contains "$codex_coord_out" "codex exec --full-auto" "Codex coordinator adapter"
  assert_contains "$codex_coord_out" "/moonshot-in-session-coordinator" "coordinator prompt"

  local fixture_lines
  mapfile -t fixture_lines < <(seed_fixture "$TMP_ROOT/render-fixture" "render" "delegated-terminal")
  local plan_dir="${fixture_lines[0]}"
  local execution_root="${fixture_lines[1]}"
  local status_file="${fixture_lines[2]}"
  local sprint_contract="${fixture_lines[3]}"

  (
    cd "$REPO_ROOT"
    AGENT_LOOP_SKIP_COMMIT_PROMPT=true AGENT_LOOP_MAX_AUTO_FIX_ATTEMPTS=1 \
      bash .claude/scripts/agent-loop.sh "$plan_dir" \
        --execution-root "$execution_root" \
        --status-file "$status_file" \
        --max-phases 1 \
        --delay 0 \
        --dry-run > "$agent_loop_out"
  )

  assert_contains "$agent_loop_out" "phaseAttemptMode: true" "phase attempt mode hint"
  assert_contains "$agent_loop_out" "activePhaseDocPath:" "active phase doc path"
  assert_contains "$agent_loop_out" "Do not invoke moonshot-phase-runner again." "anti-recursion rule"
  assert_contains "$sprint_contract" "## Policy Anchors" "policy anchors section"
  assert_contains "$sprint_contract" "Verification contract:" "verification contract anchor"
}

run_actual_flow() {
  local runtime="$1"
  local execution_mode="$2"
  local scenario_name="$3"
  local workspace_root="$TMP_ROOT/$scenario_name/workspace"
  local fixture_root="$workspace_root/runtime-parity-fixtures/$scenario_name"
  local before_git="$TMP_ROOT/$scenario_name-before-git.txt"
  local after_git="$TMP_ROOT/$scenario_name-after-git.txt"
  local log_file="$TMP_ROOT/$scenario_name.log"
  local sentinel="$TMP_ROOT/$scenario_name.sentinel"
  local fixture_lines

  prepare_workspace_copy "$workspace_root"
  mapfile -t fixture_lines < <(seed_fixture "$fixture_root" "$scenario_name" "$execution_mode")
  local plan_dir="${fixture_lines[0]}"
  local execution_root="${fixture_lines[1]}"
  local status_file="${fixture_lines[2]}"
  local sprint_contract="${fixture_lines[3]}"
  local qa_report="${fixture_lines[4]}"

  initialize_workspace_git "$workspace_root"

  local qa_checksum_before
  qa_checksum_before="$(checksum_file "$qa_report")"

  snapshot_git_status "$workspace_root" "$before_git"
  touch "$sentinel"

  if [[ "$execution_mode" == "delegated-terminal" ]]; then
    if ! (
      cd "$workspace_root"
      MOONSHOT_CODEX_REASONING_EFFORT=low \
        AGENT_LOOP_SKIP_COMMIT_PROMPT=true AGENT_LOOP_MAX_AUTO_FIX_ATTEMPTS=1 \
        AGENT_LOOP_WATCHDOG_CHECK_SECONDS=5 AGENT_LOOP_WATCHDOG_MAX_SECONDS=90 \
        bash .claude/scripts/agent-loop.sh "$plan_dir" \
          --execution-root "$execution_root" \
          --status-file "$status_file" \
          --runtime "$runtime" \
          --max-phases 1 \
          --delay 0 > "$log_file" 2>&1
    ); then
      tail -80 "$log_file" >&2 || true
      if grep -Fq "watchdog" "$log_file" || grep -Fq "timed out" "$log_file"; then
        record_actual_failure "$scenario_name" "delegated-terminal command timed out"
      else
        record_actual_failure "$scenario_name" "delegated-terminal command failed"
      fi
      return 1
    fi
  else
    if ! (
      cd "$workspace_root"
      MOONSHOT_CODEX_REASONING_EFFORT=low \
        bash .claude/scripts/moonshot-phase-dispatch.sh "$plan_dir" \
        --execution-mode "$execution_mode" \
        --status-file "$status_file" \
        --execution-root "$execution_root" \
        --runtime "$runtime" \
        --max-attempts 1 \
        --stop-on-failure > "$log_file" 2>&1
    ); then
      tail -80 "$log_file" >&2 || true
      record_actual_failure "$scenario_name" "in-session-coordinator command failed"
      return 1
    fi
  fi

  snapshot_git_status "$workspace_root" "$after_git"
  if ! assert_allowed_git_changes "$before_git" "$after_git"; then
    tail -80 "$log_file" >&2 || true
    record_actual_failure "$scenario_name" "unexpected git changes detected"
    return 1
  fi

  if ! grep -Fq "status: completed" "$status_file"; then
    tail -80 "$log_file" >&2 || true
    record_actual_failure "$scenario_name" "phase did not reach completed status"
    return 1
  fi

  if ! grep -Fq "## Policy Anchors" "$sprint_contract"; then
    record_actual_failure "$scenario_name" "policy anchors missing from sprint contract"
    return 1
  fi

  local qa_checksum_after
  qa_checksum_after="$(checksum_file "$qa_report")"
  if [[ "$qa_checksum_before" == "$qa_checksum_after" ]]; then
    tail -80 "$log_file" >&2 || true
    record_actual_failure "$scenario_name" "QA report was not updated"
    return 1
  fi

  local verdict_file
  verdict_file="$(latest_new_file "$workspace_root" 'verification-verdict-*.json' "$sentinel")"
  if [[ -z "$verdict_file" ]]; then
    tail -80 "$log_file" >&2 || true
    record_actual_failure "$scenario_name" "no fresh verification verdict"
    return 1
  fi
  if ! assert_passed_verdict "$verdict_file"; then
    record_actual_failure "$scenario_name" "verification verdict was not passed"
    return 1
  fi

  log "actual runtime smoke passed: ${scenario_name}"
  return 0
}

run_actual_matrix() {
  local scenarios=(
    "claude|delegated-terminal|claude-delegated-real"
    "claude|in-session-coordinator|claude-coordinator-real"
    "codex|delegated-terminal|codex-delegated-real"
    "codex|in-session-coordinator|codex-coordinator-real"
  )
  local entry runtime mode scenario_name

  for entry in "${scenarios[@]}"; do
    IFS='|' read -r runtime mode scenario_name <<EOF
$entry
EOF
    if ! runtime_is_available "$runtime"; then
      warn "skipping ${scenario_name}: runtime unavailable"
      continue
    fi
    run_actual_flow "$runtime" "$mode" "$scenario_name" || true
  done
}

report_failures_and_exit() {
  local item

  if [[ ${#RUNTIME_FAILURES[@]} -eq 0 && ${#ACTUAL_FAILURES[@]} -eq 0 ]]; then
    log "phase runtime parity smoke passed"
    return 0
  fi

  log "phase runtime parity smoke failed"
  for item in "${RUNTIME_FAILURES[@]}"; do
    log "- runtime: $item"
  done
  for item in "${ACTUAL_FAILURES[@]}"; do
    log "- actual: $item"
  done

  if [[ "$KEEP_TMP" == "true" ]]; then
    log "debug temp root: $TMP_ROOT"
  fi
  return 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --render-only)
      RUN_REAL=false
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      if [[ "$1" == --* ]]; then
        usage
        fail "unknown option: $1"
      fi
      REFERENCE_PLAN_DIR="$1"
      shift
      ;;
  esac
done

if [[ ! -d "$REFERENCE_PLAN_DIR" ]]; then
  fail "reference plan directory not found: $REFERENCE_PLAN_DIR"
fi

require_command claude
require_command codex
require_command python3
require_command shasum

run_render_matrix

if [[ "$RUN_REAL" == "true" ]]; then
  run_runtime_probes
  run_actual_matrix
fi

report_failures_and_exit
