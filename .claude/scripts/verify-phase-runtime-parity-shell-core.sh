#!/usr/bin/env bash

# Runtime parity smoke for Moonshot phase execution.
# Coverage:
#   - render matrix for delegated-terminal and in-session-coordinator across Claude/Codex
#     (Codex coordinator path is exercised with interactive mode explicitly enabled)
#   - runtime availability probes for the selected runtime target(s)
#   - actual delegated-terminal + in-session-coordinator runs for the selected runtime target(s)
#   - artifact/status/verdict assertions after each actual run

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/runtime-cli.sh"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
REFERENCE_PLAN_DIR=".claude/docs/runtime-parity-reference-plan"
RUN_REAL=true
TMP_ROOT="$(mktemp -d)"
KEEP_TMP="${PHASE_RUNTIME_PARITY_KEEP_TMP:-false}"
PHASE_RUNTIME_PARITY_WATCHDOG_MAX_SECONDS="${PHASE_RUNTIME_PARITY_WATCHDOG_MAX_SECONDS:-600}"
PHASE_RUNTIME_PARITY_WATCHDOG_CHECK_SECONDS="${PHASE_RUNTIME_PARITY_WATCHDOG_CHECK_SECONDS:-5}"
PHASE_RUNTIME_PARITY_WATCHDOG_MAX_RESTARTS="${PHASE_RUNTIME_PARITY_WATCHDOG_MAX_RESTARTS:-0}"
PHASE_RUNTIME_PARITY_OLLAMA_TIMEOUT_MS="${PHASE_RUNTIME_PARITY_OLLAMA_TIMEOUT_MS:-300000}"
PHASE_RUNTIME_PARITY_KILL_STALE="${PHASE_RUNTIME_PARITY_KILL_STALE:-true}"
PHASE_RUNTIME_PARITY_TARGET_RUNTIMES="${PHASE_RUNTIME_PARITY_TARGET_RUNTIMES:-auto}"
CLAUDE_AVAILABLE=false
CODEX_AVAILABLE=false
RUNTIME_FAILURES=()
ACTUAL_FAILURES=()
ACTUAL_TIMINGS=()
TARGET_RUNTIME_SET=()

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

Environment:
  PHASE_RUNTIME_PARITY_TARGET_RUNTIMES=auto|current|claude|codex|both
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

terminate_stale_verify_workers() {
  if [[ "$PHASE_RUNTIME_PARITY_KILL_STALE" != "true" ]]; then
    return 0
  fi

  local current_pid
  current_pid=$$
  local -a patterns=(
    "[b]ash .claude/scripts/verify-phase-runtime-parity.sh"
    "[b]ash .claude/scripts/verify-phase-runtime-parity-shell-core.sh"
    "[n]ode .claude/scripts/verify-phase-runtime-parity.mjs"
    "[b]ash .claude/scripts/moonshot-phase-dispatch.sh"
    "[c]laude --dangerously-skip-permissions --no-session-persistence -p /moonshot-in-session-coordinator"
  )
  local pattern
  local pid
  local command_line

  for pattern in "${patterns[@]}"; do
    while IFS= read -r pid; do
      if [[ -z "$pid" || "$pid" == "$current_pid" ]]; then
        continue
      fi
      command_line="$(ps -p "$pid" -o command= 2>/dev/null || true)"
      if [[ -z "$command_line" ]]; then
        continue
      fi
      if kill -0 "$pid" 2>/dev/null; then
        warn "stale worker found (pid=$pid): $command_line"
        kill "$pid" 2>/dev/null || true
        sleep 1
        kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
      fi
    done < <(runtime_cli_find_pids_by_pattern "$pattern")
  done
}

terminate_stale_verify_workers

assert_contains() {
  local file="$1"
  local pattern="$2"
  local description="$3"
  if ! grep -Fq -- "$pattern" "$file"; then
    fail "missing ${description}: ${pattern}"
  fi
}

read_fixture_lines() {
  local fixture_root="$1"
  local scenario_name="$2"
  local execution_mode="$3"
  local __resultvar="$4"
  local line
  local -a lines=()

  while IFS= read -r line; do
    lines+=("$line")
  done < <(seed_fixture "$fixture_root" "$scenario_name" "$execution_mode")

  eval "$__resultvar=(\"\${lines[@]}\")"
}

array_length() {
  local array_name="$1"
  local length=0

  eval 'if [[ ${'"$array_name"'[@]+_} ]]; then length=${#'"$array_name"'[@]}; fi'
  printf '%s\n' "$length"
}

format_duration() {
  local total_seconds="$1"
  local minutes=$((total_seconds / 60))
  local seconds=$((total_seconds % 60))

  if [[ "$minutes" -gt 0 ]]; then
    printf '%sm %02ds' "$minutes" "$seconds"
  else
    printf '%ss' "$seconds"
  fi
}

record_actual_timing() {
  local scenario_name="$1"
  local elapsed_seconds="$2"
  ACTUAL_TIMINGS+=("${scenario_name}|${elapsed_seconds}")
}

checksum_file() {
  shasum "$1" | awk '{print $1}'
}

tree_checksum() {
  local target_dir="$1"

  python3 - "$target_dir" <<'PY'
import hashlib
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
if not root.exists():
    print("")
    raise SystemExit(0)

digest = hashlib.sha256()
for path in sorted((candidate for candidate in root.rglob('*') if candidate.is_file()), key=lambda candidate: candidate.as_posix()):
    digest.update(path.relative_to(root).as_posix().encode('utf-8'))
    digest.update(b'\0')
    digest.update(path.read_bytes())
    digest.update(b'\0')

print(digest.hexdigest())
PY
}

write_agent_loop_log() {
  local log_file="$1"
  shift

  mkdir -p "$(dirname "$log_file")"
  printf '%s\n' "$@" > "$log_file"
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
    ".claude/logs/workflow-enforcement/",
    ".claude/memory.json",
    ".claude/memorygraph/",
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

format_runtime_failure() {
  local runtime="$1"
  local code="$2"
  local detail="$3"

  if [[ -n "$code" && "$code" != "unknown" ]]; then
    printf '%s [%s]: %s\n' "$runtime" "$code" "$detail"
    return
  fi

  printf '%s: %s\n' "$runtime" "$detail"
}

record_runtime_failure() {
  local runtime="$1"
  local code="$2"
  local detail="$3"
  RUNTIME_FAILURES+=("$(format_runtime_failure "$runtime" "$code" "$detail")")
}

classify_codex_probe_failure() {
  local primary_file="$1"
  local secondary_file="$2"

  if grep -Fqi "state db discrepancy" "$primary_file" "$secondary_file"; then
    printf '%s\n' "state_db_inconsistent"
    return 0
  fi

  if grep -Fqi "Failed to check rollout age for snapshot" "$primary_file" "$secondary_file" || grep -Fqi "shell_snapshot" "$primary_file" "$secondary_file"; then
    printf '%s\n' "shell_snapshot_inconsistent"
    return 0
  fi

  if grep -Fqi ".codex/sessions" "$primary_file" "$secondary_file" && grep -Fqi "permission denied" "$primary_file" "$secondary_file"; then
    printf '%s\n' "session_storage_permission_denied"
    return 0
  fi

  if grep -Fqi "session storage is not writable" "$primary_file" "$secondary_file"; then
    printf '%s\n' "session_storage_unwritable"
    return 0
  fi

  if grep -Fqi "error sending request for url" "$primary_file" "$secondary_file" || grep -Fqi "network error" "$primary_file" "$secondary_file"; then
    printf '%s\n' "network_unavailable"
    return 0
  fi

  if grep -Fqi "login" "$primary_file" "$secondary_file" && grep -Fqi "codex" "$primary_file" "$secondary_file"; then
    printf '%s\n' "login_required"
    return 0
  fi

  printf '%s\n' "probe_unknown"
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

resolve_current_runtime() {
  if [[ -n "${CODEX_THREAD_ID:-}" || -n "${CODEX_CI:-}" ]]; then
    printf '%s\n' "codex"
    return 0
  fi

  if [[ -n "${CLAUDE_PROJECT_DIR:-}" || -n "${CLAUDECODE:-}" || -n "${CLAUDE_CODE:-}" ]]; then
    printf '%s\n' "claude"
    return 0
  fi

  if command -v codex >/dev/null 2>&1 && ! command -v claude >/dev/null 2>&1; then
    printf '%s\n' "codex"
    return 0
  fi

  if command -v claude >/dev/null 2>&1 && ! command -v codex >/dev/null 2>&1; then
    printf '%s\n' "claude"
    return 0
  fi

  if command -v codex >/dev/null 2>&1; then
    printf '%s\n' "codex"
    return 0
  fi

  printf '%s\n' "claude"
}

resolve_target_runtime_set() {
  local target="${PHASE_RUNTIME_PARITY_TARGET_RUNTIMES:-auto}"
  local current_runtime

  case "$target" in
    auto|current)
      current_runtime="$(resolve_current_runtime)"
      TARGET_RUNTIME_SET=("$current_runtime")
      ;;
    claude)
      TARGET_RUNTIME_SET=("claude")
      ;;
    codex)
      TARGET_RUNTIME_SET=("codex")
      ;;
    both)
      TARGET_RUNTIME_SET=("claude" "codex")
      ;;
    *)
      fail "unknown PHASE_RUNTIME_PARITY_TARGET_RUNTIMES: $target"
      ;;
  esac
}

target_runtime_selected() {
  local runtime="$1"
  local selected

  for selected in "${TARGET_RUNTIME_SET[@]}"; do
    if [[ "$selected" == "$runtime" ]]; then
      return 0
    fi
  done

  return 1
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
      --exclude='./.claude/memorygraph' \
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

  if ! command -v claude >/dev/null 2>&1; then
    record_runtime_failure "claude" "cli_missing" "CLI not installed on this machine"
    return 1
  fi

  set +e
  (
    cd "$REPO_ROOT"
    claude --dangerously-skip-permissions --no-session-persistence -p --output-format text \
      'Reply exactly with RUNTIME_OK and nothing else.'
  ) >"$output_file" 2>"$error_file"
  local exit_code=$?
  set -e

  if grep -Fxq "RUNTIME_OK" "$output_file"; then
    CLAUDE_AVAILABLE=true
    log "runtime probe passed: claude"
    return 0
  fi

  detail="$(summarize_probe_detail "$error_file" "$output_file")"
  if grep -Fqi "needs an update" "$error_file" "$output_file"; then
    record_runtime_failure "claude" "needs_update" "TODO: when Claude access is restored, update the Claude CLI on this machine (${detail:-no additional detail})"
  elif grep -Fqi "does not have access to Claude" "$error_file" "$output_file"; then
    record_runtime_failure "claude" "access_unavailable" "TODO: enable Claude subscription/access on this machine (${detail:-no additional detail})"
  elif grep -Fqi "Please login again" "$error_file" "$output_file"; then
    record_runtime_failure "claude" "login_required" "TODO: enable Claude login/subscription on this machine (${detail:-no additional detail})"
  elif grep -Fqi "Could not resolve authentication method" "$error_file" "$output_file"; then
    record_runtime_failure "claude" "auth_unconfigured" "TODO: configure Claude authentication on this machine (${detail:-no additional detail})"
  elif [[ $exit_code -eq 0 && ! -s "$output_file" && ! -s "$error_file" ]]; then
    record_runtime_failure "claude" "probe_no_output" "TODO: verify Claude auth/subscription on this machine"
  else
    record_runtime_failure "claude" "probe_unknown" "TODO: verify Claude runtime availability (${detail:-probe exited with code ${exit_code}})"
  fi

  return 1
}

probe_codex_runtime() {
  local output_file="$TMP_ROOT/codex-probe.out"
  local stdout_file="$TMP_ROOT/codex-probe.stdout"
  local error_file="$TMP_ROOT/codex-probe.err"
  local detail
  local failure_code
  local probe_home="$TMP_ROOT/codex-probe-home"
  local -a probe_env=()

  if ! command -v codex >/dev/null 2>&1; then
    record_runtime_failure "codex" "cli_missing" "CLI not installed on this machine"
    return 1
  fi

  runtime_cli_append_codex_probe_env probe_env "$probe_home"

  set +e
  (
    cd "$REPO_ROOT"
    local -a cmd=(env "${probe_env[@]}")
    runtime_cli_append_codex_base_args cmd "$REPO_ROOT"
    cmd+=(-o "$output_file" 'Reply exactly with RUNTIME_OK and nothing else.')
    "${cmd[@]}"
  ) >"$stdout_file" 2>"$error_file"
  local exit_code=$?
  set -e

  if grep -Fxq "RUNTIME_OK" "$output_file"; then
    CODEX_AVAILABLE=true
    log "runtime probe passed: codex"
    return 0
  fi

  detail="$(summarize_probe_detail "$error_file" "$stdout_file")"
  failure_code="$(classify_codex_probe_failure "$error_file" "$stdout_file")"
  case "$failure_code" in
    state_db_inconsistent)
      record_runtime_failure "codex" "$failure_code" "isolated probe reported rollout/session state DB inconsistency (${detail:-no additional detail})"
      ;;
    shell_snapshot_inconsistent)
      record_runtime_failure "codex" "$failure_code" "isolated probe reported shell snapshot state inconsistency (${detail:-no additional detail})"
      ;;
    session_storage_permission_denied)
      record_runtime_failure "codex" "$failure_code" "session storage permission denied (${detail:-no additional detail})"
      ;;
    session_storage_unwritable)
      record_runtime_failure "codex" "$failure_code" "session storage is not writable (${detail:-no additional detail})"
      ;;
    network_unavailable)
      record_runtime_failure "codex" "$failure_code" "network access unavailable (${detail:-no additional detail})"
      ;;
    login_required)
      record_runtime_failure "codex" "$failure_code" "login required (${detail:-no additional detail})"
      ;;
    *)
      record_runtime_failure "codex" "$failure_code" "${detail:-probe exited with code ${exit_code}}"
      ;;
  esac

  return 1
}

run_runtime_probes() {
  if target_runtime_selected "claude"; then
    probe_claude_runtime || warn "runtime probe failed: claude"
  fi

  if target_runtime_selected "codex"; then
    probe_codex_runtime || warn "runtime probe failed: codex"
  fi
}

run_with_runtime_timeout() {
  local timeout_seconds="$1"
  shift
  local -a env_assignments=()
  while [[ $# -gt 0 && "$1" == *=* ]]; do
    env_assignments+=("$1")
    shift
  done
  local -a cmd=("$@")
  if [[ ${#env_assignments[@]} -gt 0 ]]; then
    cmd=(env "${env_assignments[@]}" "${cmd[@]}")
  fi
  if command -v timeout >/dev/null 2>&1; then
    timeout "$timeout_seconds" "${cmd[@]}"
    return $?
  fi

  local pid
  local exit_code=0
  "${cmd[@]}" &
  pid=$!
  (
    sleep "$timeout_seconds"
    kill -0 "$pid" >/dev/null 2>&1 && kill -TERM "$pid" >/dev/null 2>&1
  ) &
  local killer_pid=$!
  wait "$pid"
  exit_code=$?
  kill "$killer_pid" >/dev/null 2>&1 || true
  wait "$killer_pid" >/dev/null 2>&1 || true

  if [[ $exit_code -eq 143 ]]; then
    return 124
  fi
  return "$exit_code"
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
  local scorecard="$phase_dir/SCORECARD.md"
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
- Update execution artifacts under ${phase_dir}
- Mark \`phase-status.yaml\` completed when the smoke passes
- Run verification with:
  - \`HARNESS_OPERATING_MODE=meta_harness VERIFY_CHANGES_SKIP_CHECKS=phaseRuntimeParity bash \${WORKSPACE_ROOT}/.claude/agents/verification/run-verify-changes.sh runtime-smoke-${scenario_name}\`

## Out of Scope
- Editing repository source files outside ${fixture_root}
- Git commits, branch changes, or workflow refactors
- Inspecting unrelated repo docs or the parity harness script itself once the execution contract is clear

## Required Steps
1. Read \`SPRINT_CONTRACT.md\` and keep the policy anchors intact.
2. Write an attempt-started checkpoint to \`QA_REPORT.md\` before broader inspection or long-running commands.
3. Refresh only the execution-artifact fields and \`phase-status.yaml\` needed for this phase attempt.
4. Record the runtime/mode in \`QA_REPORT.md\` and keep the \`## Workflow Execution\` section current.
   - Keep \`Selected bundles\` as canonical bundle ids, not stage-order prose.
   - While the phase is still active, keep \`Next path: retry_loop\` until clean finish is actually earned.
5. Run the verification command exactly once for fresh evidence.
6. Read the newest \`.claude/verification-verdict-*.json\` file and record its path and verdict in \`QA_REPORT.md\`.
7. Refresh \`SCORECARD.md\` and \`QA_REPORT.md\` again after verification instead of batching every artifact update at the end.
8. If verification passes, mark phase 1 completed in \`phase-status.yaml\` and stop immediately after updating the execution artifacts.
9. If verification fails, update \`HANDOFF.md\`, keep the \`session-logger\` note intact, and stop without touching repository source files.
   - Keep \`verification_failed\` in \`QA_REPORT.md\` only; in \`HANDOFF.md\`, use \`Stop reason: blocked\` or \`Stop reason: deferred_verification\`.

## Completion
- \`QA_REPORT.md\` changed during the run
- Fresh verification verdict exists after the run
- \`QA_REPORT.md\` records review completed, \`Next path: clean_finish\`, and \`Closeout reason: scope_complete\`
- \`QA_REPORT.md\` records source plan conformance as passed
- \`SCORECARD.md\` records \`OBJ-CONFORM\` as pass
- \`SCORECARD.md\` records \`Verdict: done\` and \`Current task status: FULL\`
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
- Phase document: ${phase_doc}

## Round Goal
- Exercise the workflow runtime for ${scenario_name} without editing repository source files.

## Source Plan Requirements Snapshot
- Source phase doc: ${phase_doc}
- Runtime path: ${scenario_name}
- Required verification command: \`HARNESS_OPERATING_MODE=meta_harness VERIFY_CHANGES_SKIP_CHECKS=phaseRuntimeParity bash \${WORKSPACE_ROOT}/.claude/agents/verification/run-verify-changes.sh runtime-smoke-${scenario_name}\`
- Required artifact updates: \`QA_REPORT.md\`, \`SCORECARD.md\`, \`HANDOFF.md\`, and \`phase-status.yaml\`
- Completion requires fresh verification evidence, review completed, source plan conformance passed, \`OBJ-CONFORM\` passed, \`Verdict: done\`, \`Current task status: FULL\`, and phase 1 completed.

## Spec Deviation Ledger
| Plan Item | Planned Requirement | Actual / Proposed Change | Approval | Completion Impact | Required Action |
|-----------|---------------------|--------------------------|----------|-------------------|-----------------|
| none | none | none | none | none | none |

## Non-Goals
- No edits outside ${fixture_root}
- No commits
- No follow-up refactors

## Stage Order
- Ready / Isolate
- Execute
- Review
- Verify
- Finish / Handoff

## Planned Changes
- Update execution artifacts and \`phase-status.yaml\` only

## Policy Anchors
- Always-loaded rules: AGENTS.md, .claude/CLAUDE.md, .claude/rules/**
- Active workspace contract: $(runtime_cli_active_workspace_contract)
- Verification contract: .claude/verification.contract.yaml
- Phase-specific guides: .claude/docs/guidelines/long-running-harness.md
- Round policy summary: runtime smoke only, no repository source edits, fresh verification evidence required

## Review Cadence
- First review checkpoint: after the active phase implementation batch
- Re-review trigger: if remediation changes behavior or evidence collection
- Review owners: codex-review-code

## Done Checks
| Check | Type | Pass Condition |
|-------|------|----------------|
| QA report updated | Docs | QA report mentions ${scenario_name} |
| Fresh verification verdict | Test | verify-changes verdict is passed |
| Review evidence | Review | \`QA_REPORT.md\` records review completed |
| Plan conformance | Policy | \`QA_REPORT.md\` records source plan conformance pass and \`SCORECARD.md\` marks \`OBJ-CONFORM\` pass |
| Scorecard closeout | Policy | \`SCORECARD.md\` records \`Verdict: done\` and \`Current task status: FULL\` |
| Phase status updated | Policy | \`phase-status.yaml\` marks phase 1 completed |
| No source edits | Policy | only execution artifacts and \`phase-status.yaml\` changed |

## Evaluator Focus
- Runtime reaches one full phase attempt
- Fresh verification evidence exists
- Repository source files remain untouched outside the fixture artifacts and \`phase-status.yaml\`
- The attempt stops after updating the artifact trio and does not continue broad repo inspection

## Evidence
- Required commands:
  - HARNESS_OPERATING_MODE=meta_harness VERIFY_CHANGES_SKIP_CHECKS=phaseRuntimeParity bash \${WORKSPACE_ROOT}/.claude/agents/verification/run-verify-changes.sh runtime-smoke-${scenario_name}
- Runtime flow:
  - execute the active phase once
- Screenshots/logs:
  - runtime smoke logs only

## Finish Rule
- Clean finish requires: fresh verification evidence, review marked complete, source plan conformance passed, \`OBJ-CONFORM\` passed, \`SCORECARD.md\` \`Verdict: done\`, \`Current task status: FULL\`, and finish-stage closeout recorded
- Resume-later handoff trigger: runtime interruption or incomplete evidence
- Retry-loop trigger: verification failure with actionable remediation
- HANDOFF stop reason codes are limited to: blocked, interrupted, context_limit, user_pause, deferred_verification
- Do not use verification_failed as a HANDOFF stop reason; it is a QA closeout reason only.

## Risks
- CLI authentication/runtime issues
- Unexpected source edits should fail the smoke
EOF

  cat > "$qa_report" <<EOF
# QA REPORT

## Slice
- Name: Runtime Smoke
- Contract: ${sprint_contract}
- Evaluator: verify-phase-runtime-parity

## Verdict
- Status: pending
- Summary: awaiting runtime execution
- Scope status: partial
- Next path: retry_loop
- Closeout reason: verification_failed

## Review Checkpoint
- Review completed: no
- Review owners: codex-review-code
- Review-driven code changes:

## Criteria Review
| Criterion | Result | Notes |
|-----------|--------|-------|
| Runtime smoke verdict | pending | awaiting execution |

## Plan Conformance Review
| Plan Item | Required | Actual | Result | Required Action |
|-----------|----------|--------|--------|-----------------|
| Source plan snapshot preserved | Runtime smoke phase requirements remain authoritative in SPRINT_CONTRACT.md | pending | pending | Verify before clean finish |
| Exact execution targets satisfied | Required verification command and artifact updates are completed | pending | pending | Run the required verification command once |
| Spec deviation ledger clean | No unapproved scope changes | pending | pending | Keep ledger as none or record user-approved replan |

## Findings
| Severity | Area | Reproduction | Expected | Actual |
|----------|------|--------------|----------|--------|
|  |  |  |  |  |

## Evidence
- Commands run:
- Runtime flow exercised:
- Logs/screenshots/artifacts:

## Workflow Execution
- Selected bundles: ready-isolate-bundle, implementation-bundle, review-bundle, verification-bundle, finish-bundle
- Applied skills: implementation-runner, completion-verifier
- Skipped skills: code-simplifier (not evaluated yet), session-logger (clean completion path)
- Selected harness components: phase-runner, contract, implementation, review, verification, finish
- Skipped harness components: none
- Selection reason: runtime parity fixture uses the full phase harness
- Runtime isolation: isolated runtime parity fixture
- Model effort profile: economy
- Effort escalation reason: none
- Selected model provider: openai
- Selected model: gpt-5.4-nano
- Selected model effort: low
- Model selection reason: runtime parity fixture
- Retrieval budget: stage=1 compact recall; stopWhenAnswerable=true; no raw graph or memory output
- Validation profile: runtime_adapter
- Phase replay policy: preserve assistant phase commentary/final_answer when replaying; never add phase to user items
- Enforcement note: replace defaults when actual execution diverges

## Finish Readiness
- Fresh evidence confirmed: no
- Why this round may stop now: the phase is still waiting for its first execution attempt and verification run.
- Remaining in-scope work: execute the active phase, run the exact verification command once, and refresh closeout artifacts.
- Remaining blockers before closeout:
  - execution has not started yet
  - fresh verification evidence is not recorded yet
- Checks to rerun if code changes again:
  - rerun the exact verification command from the sprint contract
EOF

  cat > "$handoff" <<EOF
# HANDOFF

## Goal
- Runtime parity smoke
- Current stage: Ready / Isolate

## Current State
- Completed:
- In progress:
- Blocked:

## Resume Trigger
- Why this handoff exists: seeded placeholder until the smoke pauses or fails
- Condition to resume: review the latest contract and QA evidence, then rerun only the active phase smoke

## Checks To Rerun
- Review:
- Verification:
- Runtime flow:

## Workflow Logging
- session-logger: required on incomplete stop
EOF

  cat > "$scorecard" <<EOF
# Phase 01 Scorecard

> Objective completion score for phase 01. Update after every meaningful implementation or verification round.
> Preset profile: platform (Platform / infra / refactor)
> Profile selection: auto:keywords:platform
> Coverage rebalance: counts:absent

## Objective Checklist
| ID | Category | Weight | Status | Evidence | Notes |
|----|----------|--------|--------|----------|-------|
| OBJ-CONFORM | Source phase plan conformance verified | 20 | pending | ${qa_report} | Source snapshot, exact targets, and approved deviations |
| OBJ-REQ | In-scope platform or infrastructure changes covered | 20 | pending | ${qa_report} | REQ-* coverage; detected=0 |
| OBJ-SCN | Critical rollout, rollback, and failure scenarios evidenced | 10 | pending | ${qa_report} | SCN-* coverage; detected=0 |
| OBJ-VER | Required verification and operational checks passed | 35 | pending | ${qa_report} | Fresh contract-backed evidence |
| OBJ-CLOSE | Runbook, risk notes, and handoff recorded | 15 | pending | ${qa_report} | Review + finish evidence present |

## Score Summary
- Current score: 0
- Target score: 100
- Unmet checklist items: 5
- Blocking defects: 0
- Verdict: retry

## Task-Level Status Adapter
- Status: FULL | PARTIAL | NO
- Current task status: NO
- Partial threshold: 60

| Status | Rule |
|--------|------|
| FULL | Target score met, unmet checklist items = 0, blocking defects = 0, and required verification evidence exists |
| PARTIAL | Core build/verification is preserved, but some REQ/SCN/UAT coverage remains incomplete |
| NO | Blocking defect, verification hard gate failure, critical regression, or score below partial threshold |

## Loop Policy
- \`done\` requires Current score >= Target score
- \`done\` requires OBJ-CONFORM = pass
- \`done\` requires Unmet checklist items = 0
- \`done\` requires Blocking defects = 0
- \`blocked\` means environment, contract, or dependency prevents progress
- \`retry\` means continue the active phase only
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
    scorecard: "${scorecard}"
EOF

  printf '%s\n' "$plan_dir" "$execution_root" "$status_file" "$sprint_contract" "$qa_report" "$handoff" "$scorecard"
}

run_render_matrix() {
  local claude_delegated_out="$TMP_ROOT/dispatch-claude-delegated.txt"
  local codex_delegated_out="$TMP_ROOT/dispatch-codex-delegated.txt"
  local claude_coord_out="$TMP_ROOT/dispatch-claude-coordinator.txt"
  local codex_coord_out="$TMP_ROOT/dispatch-codex-coordinator.txt"
  local agent_loop_out="$TMP_ROOT/agent-loop-dry-run.txt"
  local reference_fixture_root="$REPO_ROOT/$REFERENCE_PLAN_DIR"
  local runtime_parity_log_dir="$REPO_ROOT/.claude/logs/agent-loop"
  local runtime_parity_fixture_log="$runtime_parity_log_dir/runtime-parity-fixture-hash.log"
  local reference_status_file="$TMP_ROOT/reference-phase-status.yaml"

  cat > "$reference_status_file" <<EOF
schemaVersion: "1.0"
masterPlan: "${REFERENCE_PLAN_DIR}/00-master-plan-v1.md"
phases:
  - number: 1
    title: "Phase 01: Dispatch Smoke"
    status: pending
    planConfirmed: true
EOF

  local reference_fixture_hash_before
  reference_fixture_hash_before="$(tree_checksum "$reference_fixture_root")"
  (
    cd "$REPO_ROOT"
    bash .claude/scripts/moonshot-phase-dispatch.sh "$REFERENCE_PLAN_DIR" --execution-mode delegated-terminal --status-file "$reference_status_file" --runtime claude --dry-run > "$claude_delegated_out"
    bash .claude/scripts/moonshot-phase-dispatch.sh "$REFERENCE_PLAN_DIR" --execution-mode delegated-terminal --status-file "$reference_status_file" --runtime codex --dry-run > "$codex_delegated_out"
    bash .claude/scripts/moonshot-phase-dispatch.sh "$REFERENCE_PLAN_DIR" --execution-mode in-session-coordinator --status-file "$reference_status_file" --runtime claude --dry-run > "$claude_coord_out"
    bash .claude/scripts/moonshot-phase-dispatch.sh "$REFERENCE_PLAN_DIR" --execution-mode in-session-coordinator --status-file "$reference_status_file" --runtime codex --allow-interactive-in-session --dry-run > "$codex_coord_out"
  )

  if ! grep -Fq -- "agent-loop.sh" "$claude_delegated_out" && ! grep -Fq -- "agent-loop.mjs" "$claude_delegated_out"; then
    fail "missing delegated-terminal adapter command: agent-loop.sh or agent-loop.mjs"
  fi
  assert_contains "$claude_delegated_out" "--runtime claude" "Claude delegated runtime flag"
  assert_contains "$codex_delegated_out" "--runtime codex" "Codex delegated runtime flag"
  assert_contains "$claude_coord_out" "claude --model" "Claude coordinator model route"
  assert_contains "$claude_coord_out" "--dangerously-skip-permissions" "Claude coordinator adapter"
  assert_contains "$claude_coord_out" "/moonshot-in-session-coordinator" "coordinator prompt"
  assert_contains "$codex_coord_out" "codex exec --sandbox workspace-write" "Codex coordinator adapter"
  assert_contains "$codex_coord_out" "/moonshot-in-session-coordinator" "coordinator prompt"

  local -a fixture_lines=()
  read_fixture_lines "$TMP_ROOT/render-fixture" "render" "delegated-terminal" fixture_lines
  local plan_dir="${fixture_lines[0]}"
  local execution_root="${fixture_lines[1]}"
  local status_file="${fixture_lines[2]}"
  local sprint_contract="${fixture_lines[3]}"
  local qa_report="${fixture_lines[4]}"
  local handoff="${fixture_lines[5]}"
  local scorecard="${fixture_lines[6]}"

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
  assert_contains "$agent_loop_out" "Do not stop at implementation-complete or verification-complete checkpoints alone." "no early stop checkpoint rule"
  assert_contains "$agent_loop_out" "review evidence is recorded, finish-closeout fields are concrete" "review and closeout stop gate"
  assert_contains "$sprint_contract" "## Policy Anchors" "policy anchors section"
  assert_contains "$sprint_contract" "## Stage Order" "stage order section"
  assert_contains "$sprint_contract" "## Review Cadence" "review cadence section"
  assert_contains "$sprint_contract" "Verification contract:" "verification contract anchor"
  assert_contains "$qa_report" "## Finish Readiness" "finish readiness section"
  assert_contains "$handoff" "## Checks To Rerun" "handoff rerun section"
  assert_contains "$scorecard" "## Score Summary" "scorecard summary section"

  local reference_fixture_hash_after
  reference_fixture_hash_after="$(tree_checksum "$reference_fixture_root")"
  if [[ "$reference_fixture_hash_before" != "$reference_fixture_hash_after" ]]; then
    fail "runtime parity reference fixture hash changed during render matrix"
  fi

  write_agent_loop_log "$runtime_parity_fixture_log" \
    "reference_fixture_path: $REFERENCE_PLAN_DIR" \
    "reference_fixture_hash_before: ${reference_fixture_hash_before:-missing}" \
    "reference_fixture_hash_after: ${reference_fixture_hash_after:-missing}" \
    "reference_fixture_hash_unchanged: true" \
    "temp_fixture_root: $TMP_ROOT/render-fixture" \
    "temp_fixture_plan_dir: $plan_dir"

  local closeout_prompt="$TMP_ROOT/closeout-remediation.txt"
  (
    cd "$REPO_ROOT"
    node .claude/scripts/agent-loop-phase-attempt.mjs build-verification-remediation-prompt 1 mock.log review-incomplete > "$closeout_prompt"
  )
  assert_contains "$closeout_prompt" "Treat the missing completion evidence as an active closeout task for this same phase" "closeout remediation stays on current phase"
  assert_contains "$closeout_prompt" "Resume at stage: review" "review-stage remediation hint"
  assert_contains "$closeout_prompt" "Do not return control just because implementation is complete or a verifier ran once." "closeout remediation no early return"
}

run_archive_sync_fixture_smoke() {
  local fixture_root="$TMP_ROOT/archive-sync-fixture"
  local reference_plan_dir="$fixture_root/.claude/docs/runtime-parity-reference-plan"
  local execution_root="$reference_plan_dir/execution"
  local status_file="$fixture_root/.claude/docs/phase-status.yaml"
  local archive_log="$REPO_ROOT/.claude/logs/agent-loop/archive-sync-fixture.log"
  local stdout_file="$TMP_ROOT/archive-sync-fixture.out"

  mkdir -p "$reference_plan_dir" "$execution_root" "$(dirname "$status_file")"

  cat > "$reference_plan_dir/00-master-plan-v1.md" <<'EOF'
# Runtime Parity Reference Plan

- Phase 01: Runtime Smoke
EOF

  cat > "$reference_plan_dir/01-runtime-smoke.md" <<'EOF'
# Phase 01: Runtime Smoke

## Goal
- Keep the runtime parity reference fixture untouched by archive sync.
EOF

  cat > "$status_file" <<'EOF'
schemaVersion: "1.0"
phases:
  - number: 1
    title: "Phase 01: Runtime Smoke"
    status: completed
    planConfirmed: true
EOF

  set +e
  (
    cd "$REPO_ROOT"
    python3 .claude/scripts/sync-phase-archive.py --status-file "$status_file" --plan-dir "$reference_plan_dir"
  ) >"$stdout_file" 2>&1
  local exit_code=$?
  set -e

  if [[ "$exit_code" -ne 0 ]]; then
    cat "$stdout_file" >&2 || true
    fail "archive sync guard smoke failed"
  fi

  assert_contains "$stdout_file" "skipping runtime parity reference fixture" "archive sync guard skip message"
  if [[ ! -f "$reference_plan_dir/01-runtime-smoke.md" ]]; then
    fail "archive sync guard moved the runtime parity reference fixture"
  fi
  if [[ -d "$reference_plan_dir/close" ]]; then
    fail "archive sync guard created a close archive under the runtime parity reference fixture"
  fi
  if grep -Fq "archivedPhaseDoc" "$status_file"; then
    fail "archive sync guard polluted archivedPhaseDoc for the runtime parity reference fixture"
  fi

  write_agent_loop_log "$archive_log" \
    "plan_dir: $reference_plan_dir" \
    "status_file: $status_file" \
    "stdout: $stdout_file" \
    "reference_fixture_preserved: true" \
    "archivedPhaseDoc_polluted: false"
}

run_workflow_enforcement_sync_smoke() {
  local fixture_root="$TMP_ROOT/workflow-enforcement-sync"
  local analysis_file="$fixture_root/moonshot-analysis.yaml"
  local sprint_contract="$fixture_root/execution/SPRINT_CONTRACT.md"
  local qa_report="$fixture_root/execution/QA_REPORT.md"
  local handoff="$fixture_root/execution/HANDOFF.md"
  local code_file="$fixture_root/example.ts"
  local verify_log="$TMP_ROOT/workflow-enforcement-sync-verify.log"

  mkdir -p "$fixture_root/execution"

  cat > "$analysis_file" <<'EOF'
schemaVersion: "1.0"
signals:
  handoffRequired: false
workflowEvidence:
  mode: bounded-direct
  selectedBundles:
    - analysis-bundle
    - implementation-bundle
  requiredSkills:
    - implementation-runner
  appliedSkills:
    - implementation-runner
  skippedSkills:
    - session-logger (clean completion path)
  selectedHarnessComponents:
    - implementation
    - review
    - verification
  skippedHarnessComponents:
    - phase-runner (bounded-direct fixture)
  selectionReason: workflow enforcement sync fixture
  runtimeIsolation: isolated fixture
  modelEffortProfile: economy
  effortEscalationReason: none
  retrievalBudget: stage=1 compact recall; stopWhenAnswerable=true; no raw graph or memory output
  validationProfile: workflow_core
  phaseReplayPolicy: preserve assistant phase commentary/final_answer when replaying; never add phase to user items
notes:
  - legacy sync fixture
EOF

  cat > "$sprint_contract" <<'EOF'
# SPRINT CONTRACT

## Source Plan Requirements Snapshot
- Fixture source requirement: workflow enforcement sync smoke must preserve required phase contract sections.

## Spec Deviation Ledger
- None.

## Stage Order
- Plan
- Ready / Isolate
- Execute
- Review
- Verify
- Finish / Handoff

## Review Cadence
- simple bounded review once after implementation

## Finish Rule
- finish starts only after review and verification are stable
EOF

  cat > "$qa_report" <<'EOF'
# QA REPORT

## Plan Conformance Review
- Source plan snapshot preserved: pass
- Spec deviation ledger: none

## Review Checkpoint
- Review completed: yes
- Review owners: codex-review-code

## Workflow Execution
- Selected bundles: analysis-bundle, ready-isolate-bundle, implementation-bundle, review-bundle, verification-bundle, finish-bundle
- Applied skills: implementation-runner, codex-review-code, code-simplifier, completion-verifier, doc-auto-sync
- Skipped skills: session-logger (clean completion path)
- Selected harness components: contract, implementation, review, verification, finish
- Skipped harness components: phase-runner (bounded direct fixture)
- Selection reason: verifier fixture exercises bounded closeout evidence
- Runtime isolation: isolated verifier fixture
- Model effort profile: economy
- Effort escalation reason: none
- Selected model provider: openai
- Selected model: gpt-5.4-nano
- Selected model effort: low
- Model selection reason: runtime parity fixture
- Retrieval budget: stage=1 compact recall; stopWhenAnswerable=true; no raw graph or memory output
- Validation profile: workflow_core
- Phase replay policy: preserve assistant phase commentary/final_answer when replaying; never add phase to user items

## Finish Readiness
- Fresh evidence confirmed: yes
EOF

  cat > "$handoff" <<'EOF'
# HANDOFF

## Resume Trigger
- Resume if verification becomes stale

## Checks To Rerun
- completion-verifier

## Workflow Logging
- session-logger: required on incomplete stop
EOF

  cat > "$code_file" <<'EOF'
export const workflowEnforcementSync = true;
EOF

  WORKFLOW_ENFORCEMENT_LOG_DIR="$fixture_root/logs" \
    bash "$REPO_ROOT/.claude/scripts/workflow-enforcement.sh" record-bounded \
      --analysis-path "$analysis_file" \
      --qa-report-path "$qa_report" \
      --handoff-path "$handoff"

  assert_contains "$analysis_file" "stageOrder:" "workflow evidence stage order"
  assert_contains "$analysis_file" "\"review-bundle\"" "workflow evidence review bundle"
  assert_contains "$analysis_file" "\"codex-review-code\"" "workflow evidence codex review evidence"
  assert_contains "$analysis_file" "qaReport:" "workflow evidence QA report path"

  WORKFLOW_ENFORCEMENT_LOG_DIR="$fixture_root/logs" \
    bash "$REPO_ROOT/.claude/scripts/workflow-enforcement.sh" record-dispatch \
      --plan-dir "$fixture_root/plan" \
      --execution-mode delegated-terminal \
      --execution-root "$fixture_root/execution" \
      --runtime codex \
      --status-file "$fixture_root/phase-status.yaml" \
      --master-plan "$fixture_root/plan/README.md"

  if ! WORKFLOW_ENFORCEMENT_LOG_DIR="$fixture_root/logs" \
      bash "$REPO_ROOT/.claude/scripts/workflow-enforcement.sh" verify \
        "$code_file" \
        "$sprint_contract" \
        "$qa_report" \
        "$handoff" \
        "$analysis_file" > "$verify_log" 2>&1; then
    cat "$verify_log" >&2 || true
    fail "workflow-enforcement sync smoke failed"
  fi

  assert_contains "$verify_log" "Violations: 0" "workflow enforcement sync success"
}

run_verify_changes_workflow_verdict_smoke() {
  local workspace_root="$TMP_ROOT/verify-changes-workflow/workspace"
  local log_file="$TMP_ROOT/verify-changes-workflow.log"
  local verdict_file="$workspace_root/.claude/verification-verdict-workflow-evidence-smoke.json"
  local analysis_file="$workspace_root/.claude/docs/moonshot-analysis.yaml"
  local qa_report="$workspace_root/.claude/docs/workflow-evidence-smoke/QA_REPORT.md"
  local handoff="$workspace_root/.claude/docs/workflow-evidence-smoke/HANDOFF.md"

  prepare_workspace_copy "$workspace_root"
  initialize_workspace_git "$workspace_root"

  mkdir -p "$workspace_root/.claude/scripts"
  mkdir -p "$(dirname "$analysis_file")" "$(dirname "$qa_report")"
  cat > "$workspace_root/.claude/scripts/workflowEvidenceSmoke.sh" <<'EOF'
#!/usr/bin/env bash
printf 'workflow evidence smoke\n'
EOF

  cat > "$qa_report" <<'EOF'
# QA REPORT

## Workflow Execution
- Selected bundles: analysis-bundle, ready-isolate-bundle, implementation-bundle, review-bundle, verification-bundle, finish-bundle
- Applied skills: implementation-runner, codex-review-code, code-simplifier, completion-verifier, doc-auto-sync
- Skipped skills: session-logger (clean completion path)
- Selected harness components: contract, implementation, review, verification, finish
- Skipped harness components: phase-runner (bounded-direct smoke)
- Selection reason: workflow evidence smoke uses bounded direct full closeout path
- Runtime isolation: isolated verifier fixture
- Model effort profile: economy
- Effort escalation reason: none
- Selected model provider: openai
- Selected model: gpt-5.4-nano
- Selected model effort: low
- Model selection reason: runtime parity fixture
- Retrieval budget: stage=1 compact recall; stopWhenAnswerable=true; no raw graph or memory output
- Validation profile: workflow_core
- Phase replay policy: preserve assistant phase commentary/final_answer when replaying; never add phase to user items
EOF

  cat > "$analysis_file" <<'EOF'
workflowEvidence:
  mode: bounded-direct
  selectedBundles:
    - analysis-bundle
    - ready-isolate-bundle
    - implementation-bundle
    - review-bundle
    - verification-bundle
    - finish-bundle
  requiredSkills:
    - implementation-runner
    - codex-review-code
    - code-simplifier
    - completion-verifier
    - doc-auto-sync
    - session-logger
  stageOrder:
    - ready/isolate
    - execute
    - review
    - verify
    - finish
  appliedSkills:
    - implementation-runner
    - codex-review-code
    - code-simplifier
    - completion-verifier
    - doc-auto-sync
  skippedSkills:
    - session-logger (clean completion path)
  selectedHarnessComponents:
    - contract
    - implementation
    - review
    - verification
    - finish
  skippedHarnessComponents:
    - phase-runner (bounded-direct smoke)
  selectionReason: workflow evidence smoke uses bounded direct full closeout path
  runtimeIsolation: isolated verifier fixture
  modelEffortProfile: economy
  effortEscalationReason: none
  retrievalBudget: stage=1 compact recall; stopWhenAnswerable=true; no raw graph or memory output
  validationProfile: workflow_core
  phaseReplayPolicy: preserve assistant phase commentary/final_answer when replaying; never add phase to user items
EOF

  cat > "$handoff" <<'EOF'
# HANDOFF

## Workflow Logging
- session-logger: required on incomplete stop
EOF

  (
    cd "$workspace_root"
    bash .claude/scripts/workflow-enforcement.sh record-bounded \
      --analysis-path .claude/docs/moonshot-analysis.yaml \
      --qa-report-path .claude/docs/workflow-evidence-smoke/QA_REPORT.md \
      --handoff-path .claude/docs/workflow-evidence-smoke/HANDOFF.md >/dev/null
  )

  (
    cd "$workspace_root"
    set +e
    VERIFY_CHANGES_SKIP_CHECKS=phaseRuntimeParity \
      HARNESS_RUN_ID=workflow-evidence-smoke \
      HARNESS_OPERATING_MODE=meta_harness \
      bash .claude/agents/verification/run-verify-changes.sh workflow-evidence-smoke > "$log_file" 2>&1
    exit 0
  )

  python3 - "$verdict_file" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    payload = json.load(handle)

workflow = payload.get("workflowEvidence") if isinstance(payload.get("workflowEvidence"), dict) else {}
if workflow.get("detected") is not True:
    raise SystemExit("workflow evidence not detected in verdict payload")
for bundle in ("review-bundle", "finish-bundle"):
    if bundle not in workflow.get("selectedBundles", []):
        raise SystemExit(f"workflow evidence missing bundle: {bundle}")
if "codex-review-code" not in workflow.get("requiredSkills", []):
    raise SystemExit("workflow evidence missing codex-review-code in requiredSkills")
if "review" not in workflow.get("selectedHarnessComponents", []):
    raise SystemExit("workflow evidence missing review harness component")
if not workflow.get("modelEffortProfile"):
    raise SystemExit("workflow evidence missing modelEffortProfile")
if not workflow.get("effortEscalationReason"):
    raise SystemExit("workflow evidence missing effortEscalationReason")
if not workflow.get("retrievalBudget"):
    raise SystemExit("workflow evidence missing retrievalBudget")
if not workflow.get("validationProfile"):
    raise SystemExit("workflow evidence missing validationProfile")
if not workflow.get("phaseReplayPolicy"):
    raise SystemExit("workflow evidence missing phaseReplayPolicy")
if workflow.get("warnings"):
    raise SystemExit(f"unexpected workflow evidence warnings: {workflow.get('warnings')}")
PY
}

run_actual_flow() {
  local runtime="$1"
  local execution_mode="$2"
  local scenario_name="$3"
  local started_at
  started_at="$(date +%s)"
  local workspace_root="$TMP_ROOT/$scenario_name/workspace"
  local fixture_root="$workspace_root/runtime-parity-fixtures/$scenario_name"
  local default_status_file="$workspace_root/.claude/docs/phase-status.yaml"
  local before_git="$TMP_ROOT/$scenario_name-before-git.txt"
  local after_git="$TMP_ROOT/$scenario_name-after-git.txt"
  local log_file="$TMP_ROOT/$scenario_name.log"
  local sentinel="$TMP_ROOT/$scenario_name.sentinel"
  local -a fixture_lines=()
  local -a dispatch_args=()

  prepare_workspace_copy "$workspace_root"
  read_fixture_lines "$fixture_root" "$scenario_name" "$execution_mode" fixture_lines
  local plan_dir="${fixture_lines[0]}"
  local execution_root="${fixture_lines[1]}"
  local status_file="${fixture_lines[2]}"
  local sprint_contract="${fixture_lines[3]}"
  local qa_report="${fixture_lines[4]}"

  log "actual runtime smoke starting: ${scenario_name} (runtime=${runtime}, mode=${execution_mode})"

  initialize_workspace_git "$workspace_root"

  # In-session coordinator skills default to .claude/docs/phase-status.yaml examples.
  # Point that default location at the fixture status file so the smoke stays bounded.
  if [[ "$execution_mode" == "in-session-coordinator" ]]; then
    mkdir -p "$(dirname "$default_status_file")"
    rm -f "$default_status_file"
    if ! ln -s "$status_file" "$default_status_file" 2>/dev/null; then
      cp "$status_file" "$default_status_file"
    fi
  fi

  local qa_checksum_before
  qa_checksum_before="$(checksum_file "$qa_report")"

  snapshot_git_status "$workspace_root" "$before_git"
  touch "$sentinel"

  if [[ "$runtime" == "codex" && "$execution_mode" == "in-session-coordinator" ]]; then
    dispatch_args+=(--allow-interactive-in-session)
  fi

  local dispatch_exit=0
  if [[ "$execution_mode" == "delegated-terminal" ]]; then
    set +e
    (
      cd "$workspace_root"
      run_with_runtime_timeout "$PHASE_RUNTIME_PARITY_WATCHDOG_MAX_SECONDS" \
        MOONSHOT_CODEX_REASONING_EFFORT=low \
        OLLAMA_REQUEST_TIMEOUT_MS="$PHASE_RUNTIME_PARITY_OLLAMA_TIMEOUT_MS" \
          AGENT_LOOP_SKIP_COMMIT_PROMPT=true AGENT_LOOP_MAX_AUTO_FIX_ATTEMPTS=1 \
          AGENT_LOOP_SCORECARD_REQUIRED=false \
          AGENT_LOOP_WATCHDOG_CHECK_SECONDS="$PHASE_RUNTIME_PARITY_WATCHDOG_CHECK_SECONDS" \
          AGENT_LOOP_WATCHDOG_MAX_SECONDS="$PHASE_RUNTIME_PARITY_WATCHDOG_MAX_SECONDS" \
          AGENT_LOOP_WATCHDOG_MAX_RESTARTS="$PHASE_RUNTIME_PARITY_WATCHDOG_MAX_RESTARTS" \
        WORKSPACE_ROOT="$REPO_ROOT" \
        bash .claude/scripts/moonshot-phase-dispatch.sh "$plan_dir" \
            --execution-mode delegated-terminal \
            --execution-root "$execution_root" \
            --status-file "$status_file" \
          --runtime "$runtime" \
          ${dispatch_args[@]+"${dispatch_args[@]}"} \
            > "$log_file" 2>&1
    )
    dispatch_exit=$?
    set -e
  else
    set +e
    (
      cd "$workspace_root"
      run_with_runtime_timeout "$PHASE_RUNTIME_PARITY_WATCHDOG_MAX_SECONDS" \
        MOONSHOT_CODEX_REASONING_EFFORT=low \
        OLLAMA_REQUEST_TIMEOUT_MS="$PHASE_RUNTIME_PARITY_OLLAMA_TIMEOUT_MS" \
        WORKSPACE_ROOT="$REPO_ROOT" \
          AGENT_LOOP_SKIP_COMMIT_PROMPT=true AGENT_LOOP_MAX_AUTO_FIX_ATTEMPTS=1 \
          AGENT_LOOP_SCORECARD_REQUIRED=false \
          AGENT_LOOP_WATCHDOG_CHECK_SECONDS="$PHASE_RUNTIME_PARITY_WATCHDOG_CHECK_SECONDS" \
          AGENT_LOOP_WATCHDOG_MAX_SECONDS="$PHASE_RUNTIME_PARITY_WATCHDOG_MAX_SECONDS" \
          AGENT_LOOP_WATCHDOG_MAX_RESTARTS="$PHASE_RUNTIME_PARITY_WATCHDOG_MAX_RESTARTS" \
        bash .claude/scripts/moonshot-phase-dispatch.sh "$plan_dir" \
          --execution-mode "$execution_mode" \
          --status-file "$status_file" \
          --execution-root "$execution_root" \
          --runtime "$runtime" \
          ${dispatch_args[@]+"${dispatch_args[@]}"} \
          --max-attempts 1 \
          --stop-on-failure > "$log_file" 2>&1
    )
    dispatch_exit=$?
    set -e
  fi

  if [[ "$dispatch_exit" -ne 0 ]]; then
    tail -80 "$log_file" >&2 || true
    local elapsed_seconds
    elapsed_seconds=$(( $(date +%s) - started_at ))
    if [[ "$dispatch_exit" -eq 124 ]]; then
      if [[ "$execution_mode" == "delegated-terminal" ]]; then
        record_actual_failure "$scenario_name" "delegated-terminal command timed out after $(format_duration "$elapsed_seconds")"
      else
        record_actual_failure "$scenario_name" "in-session-coordinator command timed out after $(format_duration "$elapsed_seconds")"
      fi
    elif grep -Fq "watchdog" "$log_file" || grep -Fq "timed out" "$log_file"; then
      if [[ "$execution_mode" == "delegated-terminal" ]]; then
        record_actual_failure "$scenario_name" "delegated-terminal command timed out after $(format_duration "$elapsed_seconds")"
      else
        record_actual_failure "$scenario_name" "in-session-coordinator command timed out after $(format_duration "$elapsed_seconds")"
      fi
    else
      if [[ "$execution_mode" == "delegated-terminal" ]]; then
        record_actual_failure "$scenario_name" "delegated-terminal command failed after $(format_duration "$elapsed_seconds")"
      else
        record_actual_failure "$scenario_name" "in-session-coordinator command failed after $(format_duration "$elapsed_seconds")"
      fi
    fi
    return 1
  fi

  if ! grep -Fq "verification-verdict" "$log_file" && grep -Fq "필수 verification 진입점 경로를 찾지 못해 phase를 진행할 수 없습니다" "$log_file"; then
    tail -40 "$log_file" >&2 || true
    local elapsed_seconds
    elapsed_seconds=$(( $(date +%s) - started_at ))
    record_actual_failure "$scenario_name" "verification entrypoint was not found after $(format_duration "$elapsed_seconds")"
    return 1
  fi

  snapshot_git_status "$workspace_root" "$after_git"
  if ! assert_allowed_git_changes "$before_git" "$after_git"; then
    tail -80 "$log_file" >&2 || true
    local elapsed_seconds
    elapsed_seconds=$(( $(date +%s) - started_at ))
    record_actual_failure "$scenario_name" "unexpected git changes detected after $(format_duration "$elapsed_seconds")"
    return 1
  fi

  if ! grep -Fq "status: completed" "$status_file"; then
    tail -80 "$log_file" >&2 || true
    local elapsed_seconds
    elapsed_seconds=$(( $(date +%s) - started_at ))
    record_actual_failure "$scenario_name" "phase did not reach completed status after $(format_duration "$elapsed_seconds")"
    return 1
  fi

  if ! grep -Fq "## Policy Anchors" "$sprint_contract"; then
    local elapsed_seconds
    elapsed_seconds=$(( $(date +%s) - started_at ))
    record_actual_failure "$scenario_name" "policy anchors missing from sprint contract after $(format_duration "$elapsed_seconds")"
    return 1
  fi
  if ! grep -Fq "## Stage Order" "$sprint_contract"; then
    local elapsed_seconds
    elapsed_seconds=$(( $(date +%s) - started_at ))
    record_actual_failure "$scenario_name" "stage order missing from sprint contract after $(format_duration "$elapsed_seconds")"
    return 1
  fi
  if ! grep -Fq "## Finish Readiness" "$qa_report"; then
    local elapsed_seconds
    elapsed_seconds=$(( $(date +%s) - started_at ))
    record_actual_failure "$scenario_name" "finish readiness missing from QA report after $(format_duration "$elapsed_seconds")"
    return 1
  fi

  local qa_checksum_after
  qa_checksum_after="$(checksum_file "$qa_report")"
  if [[ "$qa_checksum_before" == "$qa_checksum_after" ]]; then
    tail -80 "$log_file" >&2 || true
    local elapsed_seconds
    elapsed_seconds=$(( $(date +%s) - started_at ))
    record_actual_failure "$scenario_name" "QA report was not updated after $(format_duration "$elapsed_seconds")"
    return 1
  fi

  local verdict_file
  verdict_file="$(latest_new_file "$workspace_root" 'verification-verdict-*.json' "$sentinel")"
  if [[ -z "$verdict_file" ]]; then
    tail -80 "$log_file" >&2 || true
    local elapsed_seconds
    elapsed_seconds=$(( $(date +%s) - started_at ))
    record_actual_failure "$scenario_name" "no fresh verification verdict after $(format_duration "$elapsed_seconds")"
    return 1
  fi
  if ! assert_passed_verdict "$verdict_file"; then
    local elapsed_seconds
    elapsed_seconds=$(( $(date +%s) - started_at ))
    record_actual_failure "$scenario_name" "verification verdict was not passed after $(format_duration "$elapsed_seconds")"
    return 1
  fi

  local elapsed_seconds
  elapsed_seconds=$(( $(date +%s) - started_at ))
  record_actual_timing "$scenario_name" "$elapsed_seconds"
  log "actual runtime smoke passed: ${scenario_name} ($(format_duration "$elapsed_seconds"))"
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
    if ! target_runtime_selected "$runtime"; then
      continue
    fi
    if ! runtime_is_available "$runtime"; then
      warn "skipping ${scenario_name}: runtime unavailable"
      record_runtime_failure "$runtime" "runtime_unavailable" "skipping ${scenario_name}: runtime unavailable"
      continue
    fi
    run_actual_flow "$runtime" "$mode" "$scenario_name" || true
  done
}

runtime_failure_mentions_codex() {
  local item
  for item in "${RUNTIME_FAILURES[@]}"; do
    if [[ "$item" == codex:* || "$item" == codex\ * ]]; then
      return 0
    fi
  done
  return 1
}

determine_runtime_exercise_level() {
  if [[ "$RUN_REAL" != "true" ]]; then
    printf '%s\n' "passed"
    return 0
  fi

  if [[ "$(array_length ACTUAL_FAILURES)" -ne 0 ]]; then
    return 1
  fi

  if [[ "$(array_length RUNTIME_FAILURES)" -eq 0 ]]; then
    printf '%s\n' "fully_exercised"
    return 0
  fi

  if runtime_failure_mentions_codex; then
    printf '%s\n' "passed_with_skipped_probe"
    return 0
  fi

  printf '%s\n' "passed_with_environment_warning"
}

report_failures_and_exit() {
  local item
  local timing_entry
  local scenario_name
  local elapsed_seconds
  local actual_failure_count
  local runtime_failure_count

  actual_failure_count="$(array_length ACTUAL_FAILURES)"
  runtime_failure_count="$(array_length RUNTIME_FAILURES)"

  if [[ "$(array_length ACTUAL_TIMINGS)" -gt 0 ]]; then
    log "actual runtime timings:"
    for timing_entry in "${ACTUAL_TIMINGS[@]}"; do
      IFS='|' read -r scenario_name elapsed_seconds <<EOF
$timing_entry
EOF
      log "- ${scenario_name}: $(format_duration "$elapsed_seconds")"
    done
  fi

  if [[ "$actual_failure_count" -eq 0 ]]; then
    if [[ "$runtime_failure_count" -gt 0 ]]; then
      for item in "${RUNTIME_FAILURES[@]}"; do
        warn "runtime unavailable: $item"
      done
    fi
    local runtime_exercise_level
    if runtime_exercise_level="$(determine_runtime_exercise_level)"; then
      log "runtime exercise level: ${runtime_exercise_level}"
    fi
    log "phase runtime parity smoke passed"
    return 0
  fi

  log "phase runtime parity smoke failed"
  if [[ "$runtime_failure_count" -gt 0 ]]; then
    for item in "${RUNTIME_FAILURES[@]}"; do
      log "- runtime: $item"
    done
  fi
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

runtime_cli_prepare_environment
require_command python3
require_command shasum
resolve_target_runtime_set

run_render_matrix
run_archive_sync_fixture_smoke
run_workflow_enforcement_sync_smoke
run_verify_changes_workflow_verdict_smoke

if [[ "$RUN_REAL" == "true" ]]; then
  run_runtime_probes
  run_actual_matrix
fi

report_failures_and_exit
