#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REAL_NODE="$(command -v node)"
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/phase-runner-boundary.XXXXXX")"
trap 'rm -rf "$TMP_ROOT"' EXIT
export PHASE_RUNTIME_DB="$TMP_ROOT/runtime-state.sqlite"

PLAN_DIR="$TMP_ROOT/plan"
EXECUTION_ROOT="$PLAN_DIR/execution"
STATUS_FILE="$TMP_ROOT/phase-status.yaml"
LOG_DIR="$TMP_ROOT/logs"
SIGNAL_LOG_DIR="$TMP_ROOT/signal-logs"
MANUAL_LEASE_LOG_DIR="$TMP_ROOT/manual-lease-logs"
PHASE_BOUNDARY_LOG_DIR="$TMP_ROOT/phase-boundary-logs"
FAKE_BIN="$TMP_ROOT/bin"
DISPATCH_OUT="$TMP_ROOT/dispatch.out"
SIGNAL_PLAN_DIR="$TMP_ROOT/signal-plan"
SIGNAL_EXECUTION_ROOT="$SIGNAL_PLAN_DIR/execution"
SIGNAL_STATUS_FILE="$TMP_ROOT/signal-phase-status.yaml"
SIGNAL_DISPATCH_OUT="$TMP_ROOT/signal-dispatch.out"
NOENV_WORKSPACE="$TMP_ROOT/noenv-workspace"
NOENV_STATUS_FILE="$TMP_ROOT/noenv-phase-status.yaml"
NOENV_DEFAULT_LOG_DIR="$NOENV_WORKSPACE/.moonshot-state/logs/workflow-enforcement"

mkdir -p "$PLAN_DIR" "$EXECUTION_ROOT" "$LOG_DIR" "$SIGNAL_LOG_DIR" "$MANUAL_LEASE_LOG_DIR" "$PHASE_BOUNDARY_LOG_DIR" "$FAKE_BIN" "$NOENV_WORKSPACE/.claude/logs/workflow-enforcement" "$NOENV_DEFAULT_LOG_DIR"

seed_master_plan() {
  local target_dir="$1"
  cat > "$target_dir/00-master-plan-v1.md" <<'EOF'
# Boundary Smoke Plan
EOF
}

seed_smoke_phase() {
  local target_dir="$1"
  cat > "$target_dir/01-smoke-phase.md" <<'EOF'
# Phase 01: Smoke Phase
EOF
}

write_pending_status() {
  local status_file="$1"
  local plan_dir="$2"
  local execution_root="$3"
cat > "$status_file" <<EOF
planDir: "$plan_dir"
masterPlan: "$plan_dir/00-master-plan-v1.md"
executionMode: in-session-coordinator
executionRoot: "$execution_root"
phases:
  - number: 1
    title: "Smoke Phase"
    status: pending
    planConfirmed: true
EOF
}

write_completed_status() {
  local status_file="$1"
  local plan_dir="$2"
  local execution_root="$3"
cat > "$status_file" <<EOF
planDir: "$plan_dir"
masterPlan: "$plan_dir/00-master-plan-v1.md"
executionMode: delegated-terminal
executionRoot: "$execution_root"
phases:
  - number: 1
    title: "Smoke Phase"
    status: completed
    planConfirmed: true
EOF
}

write_completed_then_pending_status() {
  local status_file="$1"
  local plan_dir="$2"
  local execution_root="$3"
cat > "$status_file" <<EOF
planDir: "$plan_dir"
masterPlan: "$plan_dir/00-master-plan-v1.md"
executionMode: delegated-terminal
executionRoot: "$execution_root"
phases:
  - number: 1
    title: "Repository Foundation"
    status: completed
    planConfirmed: true
  - number: 2
    title: "Schema and State Foundation"
    status: pending
    planConfirmed: true
EOF
}

assert_contains() {
  local file="$1"
  local expected="$2"
  local label="$3"
  if ! grep -Fq "$expected" "$file"; then
    echo "FAIL: missing ${label}: ${expected}" >&2
    echo "--- ${file} ---" >&2
    cat "$file" >&2
    exit 1
  fi
}

assert_text_contains() {
  local text="$1"
  local expected="$2"
  local label="$3"
  if [[ "$text" != *"$expected"* ]]; then
    echo "FAIL: missing ${label}: ${expected}" >&2
    printf '%s\n' "$text" >&2
    exit 1
  fi
}

assert_text_not_contains() {
  local text="$1"
  local unexpected="$2"
  local label="$3"
  if [[ "$text" == *"$unexpected"* ]]; then
    echo "FAIL: unexpected ${label}: ${unexpected}" >&2
    printf '%s\n' "$text" >&2
    exit 1
  fi
}

assert_text_contains_any() {
  local text="$1"
  local first="$2"
  local second="$3"
  local label="$4"
  if [[ "$text" != *"$first"* && "$text" != *"$second"* ]]; then
    echo "FAIL: missing ${label}: ${first} OR ${second}" >&2
    printf '%s\n' "$text" >&2
    exit 1
  fi
}

mkdir -p "$PLAN_DIR" "$EXECUTION_ROOT" "$LOG_DIR" "$FAKE_BIN" "$NOENV_WORKSPACE/.claude/logs/workflow-enforcement" "$NOENV_DEFAULT_LOG_DIR"
seed_master_plan "$PLAN_DIR"
seed_smoke_phase "$PLAN_DIR"

cat > "$FAKE_BIN/claude" <<'EOF'
#!/usr/bin/env bash
if [[ "${1:-}" == "--help" ]]; then
  exit 0
fi
echo "fake claude clean exit"
exit 0
EOF
chmod +x "$FAKE_BIN/claude"

write_pending_status "$STATUS_FILE" "$PLAN_DIR" "$EXECUTION_ROOT"

RUNTIME_POLICY_OUTPUT="$(CODEX_THREAD_ID=thread-smoke AGENT_LOOP_RUNTIME_SCOPE=same PATH="$FAKE_BIN:$PATH" ROOT_DIR="$ROOT_DIR" node --input-type=module <<'EOF'
const rootDir = process.env.ROOT_DIR;
const mod = await import(`file://${rootDir}/.claude/scripts/lib/verification-contract.mjs`);
const available = mod.resolveAvailableRuntimes({
  requestedRuntime: 'auto',
  verificationRuntimes: 'current',
  currentRuntime: 'codex',
});
process.stdout.write(`available=${available.join(',')}\n`);
EOF
)"
assert_text_contains "$RUNTIME_POLICY_OUTPUT" "available=" "runtime availability output"
assert_text_not_contains "$RUNTIME_POLICY_OUTPUT" "claude" "claude runtime on codex parent same-scope preflight"

set +e
PATH="$FAKE_BIN:$PATH" \
WORKFLOW_ENFORCEMENT_LOG_DIR="$LOG_DIR" \
PHASE_DISPATCH_KILL_STALE=false \
PHASE_RUNTIME_DB="$TMP_ROOT/runtime-state.sqlite" \
PHASE_DISPATCH_MAX_PLAN_COMPLETION_RESTARTS=1 \
node "$ROOT_DIR/.claude/scripts/moonshot-phase-dispatch.mjs" \
  "$PLAN_DIR" \
  --execution-mode in-session-coordinator \
  --status-file "$STATUS_FILE" \
  --execution-root "$EXECUTION_ROOT" \
  --runtime claude >"$DISPATCH_OUT" 2>&1
DISPATCH_STATUS=$?
set -e

if [[ "$DISPATCH_STATUS" -eq 0 ]]; then
  echo "FAIL: in-session coordinator clean exit with pending phase should not succeed" >&2
  cat "$DISPATCH_OUT" >&2
  exit 1
fi

assert_text_not_contains "$(cat "$DISPATCH_OUT")" "Restarting coordinator" "coordinator restart suppression"
assert_contains "$DISPATCH_OUT" "Stopping instead of restarting." "no-progress restart suppression"
DISPATCH_ACTIVE_LEASE="$(compgen -G "$LOG_DIR/active-phase-run-*.json" | head -n 1 || true)"
DISPATCH_CURRENT_RUN="$(compgen -G "$LOG_DIR/current-run-*.json" | head -n 1 || true)"
if [[ -z "$DISPATCH_ACTIVE_LEASE" ]]; then
  echo "FAIL: production dispatch did not create namespaced active-phase-run lease" >&2
  exit 1
fi
if [[ -z "$DISPATCH_CURRENT_RUN" ]]; then
  echo "FAIL: production dispatch did not create namespaced current-run mirror" >&2
  exit 1
fi
assert_contains "$DISPATCH_ACTIVE_LEASE" "\"runLeaseId\": \"dispatch-" "dispatch lease id"
assert_contains "$DISPATCH_ACTIVE_LEASE" "\"executionBoundary\": \"in-session-coordinator\"" "dispatch lease execution boundary"
assert_contains "$DISPATCH_ACTIVE_LEASE" "\"status\": \"paused\"" "dispatch lease paused state"
assert_contains "$DISPATCH_CURRENT_RUN" "\"phaseRunLease\"" "current-run phase lease mirror"
assert_contains "$DISPATCH_CURRENT_RUN" "\"stopReasonCode\": \"in-session-coordinator-no-progress-restart\"" "current-run stop reason"
assert_contains "$STATUS_FILE" "activeExecutionStatus: \"paused\"" "dispatch paused execution status"

cat > "$FAKE_BIN/node" <<EOF
#!/usr/bin/env bash
if [[ "\${1:-}" == ".claude/scripts/agent-loop.mjs" || "\${1:-}" == "$ROOT_DIR/.claude/scripts/agent-loop.mjs" ]]; then
  kill -TERM "\$\$"
fi
exec "$REAL_NODE" "\$@"
EOF
chmod +x "$FAKE_BIN/node"

mkdir -p "$SIGNAL_PLAN_DIR" "$SIGNAL_EXECUTION_ROOT"
seed_master_plan "$SIGNAL_PLAN_DIR"
seed_smoke_phase "$SIGNAL_PLAN_DIR"
write_pending_status "$SIGNAL_STATUS_FILE" "$SIGNAL_PLAN_DIR" "$SIGNAL_EXECUTION_ROOT"

set +e
PATH="$FAKE_BIN:$PATH" \
WORKFLOW_ENFORCEMENT_LOG_DIR="$SIGNAL_LOG_DIR" \
PHASE_DISPATCH_KILL_STALE=false \
PHASE_RUNTIME_DB="$TMP_ROOT/runtime-state.sqlite" \
"$REAL_NODE" "$ROOT_DIR/.claude/scripts/moonshot-phase-dispatch.mjs" \
  "$SIGNAL_PLAN_DIR" \
  --execution-mode delegated-terminal \
  --status-file "$SIGNAL_STATUS_FILE" \
  --execution-root "$SIGNAL_EXECUTION_ROOT" \
  --runtime claude >"$SIGNAL_DISPATCH_OUT" 2>&1
SIGNAL_DISPATCH_STATUS=$?
set -e

if [[ "$SIGNAL_DISPATCH_STATUS" -eq 0 ]]; then
  echo "FAIL: delegated-terminal signal-like no-closeout exit should not succeed" >&2
  cat "$SIGNAL_DISPATCH_OUT" >&2
  exit 1
fi

assert_contains "$SIGNAL_DISPATCH_OUT" "Stopping instead of restarting." "signal no-closeout stop"
assert_text_not_contains "$(cat "$SIGNAL_DISPATCH_OUT")" "Restarting autonomous loop" "signal restart suppression"
SIGNAL_CURRENT_RUN="$(compgen -G "$SIGNAL_LOG_DIR/current-run-*.json" | head -n 1 || true)"
if [[ -z "$SIGNAL_CURRENT_RUN" ]]; then
  echo "FAIL: signal dispatch did not create a current-run mirror" >&2
  exit 1
fi
assert_contains "$SIGNAL_CURRENT_RUN" "\"stopReasonCode\": \"delegated-terminal-signal-no-closeout\"" "signal current-run stop reason"

WORKFLOW_ENFORCEMENT_LOG_DIR="$MANUAL_LEASE_LOG_DIR" \
node "$ROOT_DIR/.claude/scripts/phase-run-lease.mjs" start \
  "$STATUS_FILE" \
  lease-smoke \
  delegated-terminal \
  "$PLAN_DIR" \
  "$EXECUTION_ROOT" \
  claude \
  "$PLAN_DIR/00-master-plan-v1.md" \
  "$$" >/dev/null

DENIED_OUTPUT="$(WORKFLOW_ENFORCEMENT_LOG_DIR="$MANUAL_LEASE_LOG_DIR" node "$ROOT_DIR/.claude/scripts/phase-run-lease.mjs" assert-return-allowed "$STATUS_FILE" lease-smoke true false)"
assert_text_contains "$DENIED_OUTPUT" "RETURN_ALLOWED='false'" "active lease return denial"
assert_text_contains "$DENIED_OUTPUT" "RETURN_REASON='actionable-phases-remaining'" "active lease denial reason"

WORKFLOW_ENFORCEMENT_LOG_DIR="$MANUAL_LEASE_LOG_DIR" \
node "$ROOT_DIR/.claude/scripts/phase-run-lease.mjs" finish \
  "$STATUS_FILE" \
  lease-smoke \
  summary \
  premature-return \
  completed-phase-only \
  failed >/dev/null

INACTIVE_OUTPUT="$(WORKFLOW_ENFORCEMENT_LOG_DIR="$MANUAL_LEASE_LOG_DIR" node "$ROOT_DIR/.claude/scripts/phase-run-lease.mjs" assert-return-allowed "$STATUS_FILE" lease-smoke true false)"
assert_text_contains "$INACTIVE_OUTPUT" "RETURN_ALLOWED='false'" "finished lease return denial"
assert_text_contains_any "$INACTIVE_OUTPUT" "RETURN_REASON='paused-run-lease-with-actionable-phases'" "RETURN_REASON='paused-goal-with-actionable-phases'" "paused lease denial reason"

write_completed_then_pending_status "$STATUS_FILE" "$PLAN_DIR" "$EXECUTION_ROOT"

WORKFLOW_ENFORCEMENT_LOG_DIR="$PHASE_BOUNDARY_LOG_DIR" \
node "$ROOT_DIR/.claude/scripts/phase-run-lease.mjs" start \
  "$STATUS_FILE" \
  lease-phase-boundary \
  delegated-terminal \
  "$PLAN_DIR" \
  "$EXECUTION_ROOT" \
  claude \
  "$PLAN_DIR/00-master-plan-v1.md" \
  "$$" >/dev/null

assert_contains "$STATUS_FILE" "activeExecutionStatus: \"active\"" "active execution lease status"
PHASE_BOUNDARY_OUTPUT="$(WORKFLOW_ENFORCEMENT_LOG_DIR="$PHASE_BOUNDARY_LOG_DIR" node "$ROOT_DIR/.claude/scripts/phase-run-lease.mjs" assert-return-allowed "$STATUS_FILE" lease-phase-boundary true false)"
assert_text_contains "$PHASE_BOUNDARY_OUTPUT" "RETURN_ALLOWED='false'" "completed-then-pending return denial"
assert_text_contains "$PHASE_BOUNDARY_OUTPUT" "RETURN_REASON='actionable-phases-remaining'" "completed-then-pending denial reason"
assert_text_contains "$PHASE_BOUNDARY_OUTPUT" "ACTIONABLE_PHASES_REMAINING='1'" "completed-then-pending actionable count"

WORKFLOW_ENFORCEMENT_LOG_DIR="$PHASE_BOUNDARY_LOG_DIR" \
node "$ROOT_DIR/.claude/scripts/phase-run-lease.mjs" finish \
  "$STATUS_FILE" \
  lease-phase-boundary \
  success-return \
  current-session-clean-finish \
  "Phase 15 complete; continuation required" \
  completed >/dev/null

assert_contains "$STATUS_FILE" "activeExecutionStatus: \"paused\"" "current-session clean finish downgraded to paused"
assert_contains "$STATUS_FILE" "lastStopReasonCode: \"actionable-phases-remaining\"" "current-session clean finish stop reason downgrade"
assert_contains "$STATUS_FILE" "lastReturnBoundary: \"dispatch-paused\"" "current-session clean finish paused return boundary"

PAUSED_OUTPUT="$(WORKFLOW_ENFORCEMENT_LOG_DIR="$PHASE_BOUNDARY_LOG_DIR" node "$ROOT_DIR/.claude/scripts/phase-run-lease.mjs" assert-return-allowed "$STATUS_FILE" lease-phase-boundary true false)"
assert_text_contains "$PAUSED_OUTPUT" "RETURN_ALLOWED='false'" "paused lease return denial"
assert_text_contains_any "$PAUSED_OUTPUT" "RETURN_REASON='paused-run-lease-with-actionable-phases'" "RETURN_REASON='paused-goal-with-actionable-phases'" "paused lease reason"

write_completed_status "$STATUS_FILE" "$PLAN_DIR" "$EXECUTION_ROOT"

ALLOWED_OUTPUT="$(WORKFLOW_ENFORCEMENT_LOG_DIR="$MANUAL_LEASE_LOG_DIR" node "$ROOT_DIR/.claude/scripts/phase-run-lease.mjs" assert-return-allowed "$STATUS_FILE" lease-smoke true false)"
assert_text_contains "$ALLOWED_OUTPUT" "RETURN_ALLOWED='true'" "plan completion return allow"
assert_text_contains "$ALLOWED_OUTPUT" "RETURN_REASON='plan_directory_complete'" "plan completion allow reason"

cat > "$NOENV_STATUS_FILE" <<EOF
planDir: "$PLAN_DIR"
executionMode: delegated-terminal
executionRoot: "$EXECUTION_ROOT"
phases:
  - number: 2
    title: "No Env Smoke"
    status: pending
    planConfirmed: true
EOF

(
  cd "$NOENV_WORKSPACE"
  node "$ROOT_DIR/.claude/scripts/phase-run-lease.mjs" start \
    "$NOENV_STATUS_FILE" \
    lease-noenv \
    delegated-terminal \
    "$PLAN_DIR" \
    "$EXECUTION_ROOT" \
    claude \
    "$PLAN_DIR/00-master-plan-v1.md" \
    "$$" >/dev/null
)

if [[ -f "$NOENV_WORKSPACE/.claude/logs/workflow-enforcement/active-phase-run.json" ]]; then
  echo "FAIL: non-default status file wrote shared active-phase-run.json" >&2
  exit 1
fi

if [[ -f "$NOENV_WORKSPACE/.claude/logs/workflow-enforcement/current-run.json" ]]; then
  echo "FAIL: non-default status file wrote shared current-run.json" >&2
  exit 1
fi

if ! compgen -G "$NOENV_DEFAULT_LOG_DIR/active-phase-run-*.json" >/dev/null; then
  echo "FAIL: non-default status file did not create namespaced active lease file" >&2
  exit 1
fi

if ! compgen -G "$NOENV_DEFAULT_LOG_DIR/current-run-*.json" >/dev/null; then
  echo "FAIL: non-default status file did not create namespaced current-run file" >&2
  exit 1
fi

PROMPT_OUTPUT="$(PLAN_DIR="$PLAN_DIR" EXECUTION_ROOT="$EXECUTION_ROOT" node --input-type=module <<'EOF'
import fs from 'node:fs';
import { ensureExecutionArtifacts, buildPhasePrompt } from './.claude/scripts/agent-loop-phase-plan-lib.mjs';

const planDir = process.env.PLAN_DIR;
const executionRoot = process.env.EXECUTION_ROOT;
const paths = ensureExecutionArtifacts({
  phaseNum: 2,
  phaseTitle: 'Smoke Phase',
  phaseDoc: `${planDir}/02-smoke-phase.md`,
  masterPlan: `${planDir}/00-master-plan-v1.md`,
  executionRoot,
  verificationContractFile: '.claude/verification.contract.yaml',
  targetCompletionScore: '100',
  scorecardProfile: 'auto',
  workspaceRoot: planDir,
});

process.stdout.write(buildPhasePrompt({
  nextPhase: 2,
  phaseTitle: 'Smoke Phase',
  planDir,
  phaseDoc: `${planDir}/02-smoke-phase.md`,
  statusFile: `${planDir}/../phase-status.yaml`,
  executionRoot,
  paths,
  runtime: 'codex',
  targetCompletionScore: '100',
  extraInstructions: 'Boundary smoke prompt.',
  autonomousInstructions: 'Autonomous mode.',
  workspaceRoot: planDir,
}));
process.stdout.write('\n---HANDOFF---\n');
process.stdout.write(fs.readFileSync(paths.phaseHandoff, 'utf8'));
EOF
)"
assert_text_contains "$PROMPT_OUTPUT" "Do not stop at implementation-complete or verification-complete checkpoints alone." "prompt checkpoint boundary guard"
assert_text_contains "$PROMPT_OUTPUT" "Return control only after fresh-or-still-valid verification evidence exists" "prompt completion gate guard"
assert_text_contains "$PROMPT_OUTPUT" "phase completion is never run completion or session completion" "prompt phase vs run boundary guard"
assert_text_contains "$PROMPT_OUTPUT" "Do not emit final-answer wording" "prompt final wording guard"
assert_text_contains "$PROMPT_OUTPUT" "Source Plan Requirements Snapshot as binding" "prompt source plan conformance guard"
assert_text_contains "$PROMPT_OUTPUT" "---HANDOFF---" "prompt handoff separator"
assert_text_contains "$PROMPT_OUTPUT" "Current stage: Finish / Handoff" "seeded handoff stage"
assert_text_contains "$PROMPT_OUTPUT" "placeholder handoff seeded before the first stop or clean-finish update" "seeded handoff placeholder reason"

PATH_AUTH_WORKSPACE="$TMP_ROOT/path-authority-workspace"
PATH_AUTH_PLAN_DIR="$PATH_AUTH_WORKSPACE/plan"
PATH_AUTH_EXECUTION_ROOT="$PATH_AUTH_PLAN_DIR/execution"
PATH_AUTH_STATUS_FILE="$TMP_ROOT/path-authority-phase-status.yaml"
PATH_AUTH_LOG_DIR="$PATH_AUTH_WORKSPACE/.claude/logs/agent-loop"

mkdir -p "$PATH_AUTH_PLAN_DIR" "$PATH_AUTH_EXECUTION_ROOT" "$PATH_AUTH_LOG_DIR"

cat > "$PATH_AUTH_PLAN_DIR/02-smoke-phase.md" <<'EOF'
# Smoke Phase
EOF

cat > "$PATH_AUTH_STATUS_FILE" <<EOF
planDir: "$PATH_AUTH_PLAN_DIR"
executionRoot: "$PATH_AUTH_EXECUTION_ROOT"
phases:
  - number: 2
    title: "Smoke Phase"
    status: pending
    sprintContract: "$PATH_AUTH_PLAN_DIR/execution/02-smoke-phase/SPRINT_CONTRACT.md"
    qaReport: "$PATH_AUTH_PLAN_DIR/execution/02-smoke-phase/QA_REPORT.md"
    handoff: "$PATH_AUTH_PLAN_DIR/execution/02-smoke-phase/HANDOFF.md"
    scorecard: "$PATH_AUTH_PLAN_DIR/execution/02-smoke-phase/SCORECARD.md"
    archivedPhaseDoc: "$PATH_AUTH_PLAN_DIR/02-smoke-phase.md"
EOF

set +e
(
  cd "$PATH_AUTH_WORKSPACE"
  node "$ROOT_DIR/.claude/scripts/agent-loop-phase-runner.mjs" \
    "$PATH_AUTH_PLAN_DIR" \
    --status-file "$PATH_AUTH_STATUS_FILE" \
    --execution-root "$PATH_AUTH_EXECUTION_ROOT" \
    --runtime codex \
    --verification-runtimes codex \
    --phase-num 2 \
    --phase-title "Smoke Phase" \
    --phase-doc "$PATH_AUTH_PLAN_DIR/02-smoke-phase.md" \
    >"$TMP_ROOT/path-authority-runner.out" 2>&1
)
PATH_AUTH_STATUS=$?
set -e

if [[ "$PATH_AUTH_STATUS" -eq 0 ]]; then
  echo "FAIL: path-authority preflight should stop runner before worker launch" >&2
  cat "$TMP_ROOT/path-authority-runner.out" >&2
  exit 1
fi

assert_contains "$TMP_ROOT/path-authority-runner.out" "path-authority-preflight-failed" "path authority runner stop reason"

if [[ ! -f "$PATH_AUTH_LOG_DIR/debug.jsonl" ]]; then
  echo "FAIL: path-authority preflight did not write a debug log" >&2
  exit 1
fi

assert_contains "$PATH_AUTH_LOG_DIR/debug.jsonl" "\"event\":\"path-authority-preflight-failed\"" "path authority debug event"
assert_text_not_contains "$(cat "$PATH_AUTH_LOG_DIR/debug.jsonl")" "worker-prompt-start" "worker prompt launch after path authority failure"

CAPABILITY_WORKSPACE="$TMP_ROOT/capability-workspace"
CAPABILITY_PLAN_DIR="$CAPABILITY_WORKSPACE/plan"
CAPABILITY_EXECUTION_ROOT="$CAPABILITY_PLAN_DIR/execution"
CAPABILITY_STATUS_FILE="$CAPABILITY_WORKSPACE/phase-status.yaml"
CAPABILITY_LOG_DIR="$CAPABILITY_WORKSPACE/.claude/logs/agent-loop"

mkdir -p "$CAPABILITY_PLAN_DIR" "$CAPABILITY_EXECUTION_ROOT" "$CAPABILITY_LOG_DIR"

cat > "$CAPABILITY_PLAN_DIR/00-master-plan.md" <<'EOF'
# Master Plan
EOF

cat > "$CAPABILITY_PLAN_DIR/03-capability-phase.md" <<'EOF'
# Capability Phase
EOF

cat > "$CAPABILITY_STATUS_FILE" <<EOF
masterPlan: "$CAPABILITY_PLAN_DIR/00-master-plan.md"
planDir: "$CAPABILITY_PLAN_DIR"
executionRoot: "$CAPABILITY_EXECUTION_ROOT"
phases:
  - number: 3
    title: "Capability Phase"
    status: pending
    archivedPhaseDoc: "$CAPABILITY_PLAN_DIR/03-capability-phase.md"
EOF

set +e
(
  cd "$CAPABILITY_WORKSPACE"
  PHASE_CAPABILITY_PREFLIGHT_FIXTURE_BLOCKER=bash_access_denied node "$ROOT_DIR/.claude/scripts/agent-loop-phase-runner.mjs" \
    "$CAPABILITY_PLAN_DIR" \
    --status-file "$CAPABILITY_STATUS_FILE" \
    --execution-root "$CAPABILITY_EXECUTION_ROOT" \
    --runtime codex \
    --verification-runtimes codex \
    --phase-num 3 \
    --phase-title "Capability Phase" \
    --phase-doc "$CAPABILITY_PLAN_DIR/03-capability-phase.md" \
    >"$TMP_ROOT/capability-runner.out" 2>&1
)
CAPABILITY_STATUS=$?
set -e

if [[ "$CAPABILITY_STATUS" -eq 0 ]]; then
  echo "FAIL: capability preflight should stop runner before worker launch" >&2
  cat "$TMP_ROOT/capability-runner.out" >&2
  exit 1
fi

if [[ ! -f "$CAPABILITY_LOG_DIR/debug.jsonl" ]]; then
  echo "FAIL: capability preflight did not write a debug log" >&2
  exit 1
fi

assert_contains "$CAPABILITY_LOG_DIR/debug.jsonl" "\"event\":\"capability-preflight-result\"" "capability preflight debug event"
assert_contains "$CAPABILITY_LOG_DIR/debug.jsonl" "\"blocked\":true" "capability preflight blocked before worker"
assert_text_not_contains "$(cat "$CAPABILITY_LOG_DIR/debug.jsonl")" "worker-prompt-start" "worker prompt launch after capability preflight failure"

assert_contains "$ROOT_DIR/.claude/scripts/agent-loop-phase-runner.mjs" "function isHardBlockedCompletionReason" "hard blocked completion classifier"
assert_contains "$ROOT_DIR/.claude/scripts/agent-loop-phase-runner.mjs" "if (isHardBlockedCompletionReason(gate.PHASE_COMPLETION_REASON) || gateStop.RETRY_POLICY === 'stop_loop')" "blocked gate remediation path"
assert_contains "$ROOT_DIR/.claude/scripts/agent-loop-phase-attempt.mjs" "gate reason starts with" "blocked gate remediation prompt"
node "$ROOT_DIR/.claude/scripts/phase-capability-preflight.mjs" self-test > "$TMP_ROOT/phase-capability-preflight-self-test.out"
assert_contains "$TMP_ROOT/phase-capability-preflight-self-test.out" "phase-capability-preflight self-test passed" "phase capability preflight self-test"
node "$ROOT_DIR/.claude/scripts/phase-parallel-planner.mjs" self-test > "$TMP_ROOT/phase-parallel-planner-self-test.out"
assert_contains "$TMP_ROOT/phase-parallel-planner-self-test.out" "phase-parallel-planner self-test passed" "phase parallel planner self-test"
node "$ROOT_DIR/.claude/scripts/phase-final-git-closeout.mjs" self-test > "$TMP_ROOT/phase-final-git-closeout-self-test.out"
assert_contains "$TMP_ROOT/phase-final-git-closeout-self-test.out" "phase-final-git-closeout self-test passed" "phase final git closeout self-test"
assert_contains "$ROOT_DIR/.claude/scripts/agent-loop.mjs" "phase-level parallel disabled because --max-phases is active" "max phases parallel disable visibility"
assert_contains "$ROOT_DIR/.claude/scripts/agent-loop.mjs" "recordPhaseParallelSequentialDecision" "phase parallel fallback decision logging"
assert_contains "$ROOT_DIR/.claude/scripts/phase-wave-coordinator.mjs" "declared-ownership-violation" "phase wave ownership violation fallback"
assert_contains "$ROOT_DIR/.claude/scripts/phase-wave-coordinator.mjs" "phase-wave-active.json" "phase wave active manifest"
assert_contains "$ROOT_DIR/.claude/scripts/phase-wave-coordinator.mjs" "PHASE_PARALLEL_PEERS_JSON" "phase wave worker peer context"
assert_contains "$ROOT_DIR/.claude/scripts/agent-loop-phase-runner.mjs" "Parallel wave worker context" "parallel worker prompt context"
assert_contains "$ROOT_DIR/.claude/scripts/moonshot-phase-dispatch.mjs" "phase-final-git-closeout-required" "dispatcher final git closeout blocking reason"
assert_contains "$ROOT_DIR/.claude/skills/moonshot-phase-runner/SKILL.md" "Enforce Final Git Closeout" "phase runner final git closeout contract"

CONFORMANCE_WORKSPACE="$TMP_ROOT/conformance-workspace"
CONFORMANCE_PHASE_DIR="$CONFORMANCE_WORKSPACE/docs/implementation/execution/22-ink-fullscreen-tui"
mkdir -p "$CONFORMANCE_WORKSPACE/docs/implementation" "$CONFORMANCE_PHASE_DIR"

cat > "$CONFORMANCE_WORKSPACE/docs/implementation/22-ink-fullscreen-tui-v1.md" <<'EOF'
# Phase 22: Ink Fullscreen TUI (v1)

## Goal
Implement the first Ink fullscreen UI.

## Expected Outcome
`agent tui --fullscreen` opens an opt-in Ink UI.

## Scope
- Ink dependency and TUI runtime package wiring.

## Detailed Tasks
- P22-1 Add Ink runtime boundary.
- P22-3 Implement fullscreen screens.

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-22-1 | `agent tui --fullscreen` opens the Ink fullscreen screen | `npm test` | Ink app compiles and fullscreen snapshot stable | `docs/implementation/execution/22-ink-fullscreen-tui/QA_REPORT.md` |

## Exact Execution Targets
| Task | Targets | Expected signal |
|------|---------|-----------------|
| P22-1 | creates `packages/tui/src/fullscreen-app.tsx`; modifies `packages/tui/package.json` | Ink app compiles |
| P22-3 | creates `packages/tui/src/screens.tsx` | fullscreen snapshot stable |
EOF

cat > "$CONFORMANCE_PHASE_DIR/SPRINT_CONTRACT.md" <<EOF
# Phase 22 Sprint Contract

## Slice
- Source phase doc: docs/implementation/22-ink-fullscreen-tui-v1.md

## Source Plan Requirements Snapshot
$(sed 's/^/  /' "$CONFORMANCE_WORKSPACE/docs/implementation/22-ink-fullscreen-tui-v1.md")

## Spec Deviation Ledger
| Plan Item | Planned Requirement | Actual / Proposed Change | Approval | Completion Impact | Required Action |
|-----------|---------------------|--------------------------|----------|-------------------|-----------------|
| none | none | none | none | none | none |

## Stage Order
- Ready / Isolate

## Review Cadence
- Review owners: codex-review-code

## Finish Rule
- Source plan conformance: required
EOF

cat > "$CONFORMANCE_PHASE_DIR/QA_REPORT.md" <<'EOF'
# Phase 22 QA Report

## Verdict
- Status: pass
- Summary: String runtime boundary completed without adding external Ink package.
- Scope status: complete
- Next path: clean_finish
- Closeout reason: scope_complete

## Review Checkpoint
- Review completed: yes

## Contract Review Evidence
- Contract reviewed by evaluator: skipped_simple
- Verification owner: completion-verifier
- Runtime evidence plan: boundary fixture compiles and records clean finish evidence
- Round fail conditions: failed verification or failed plan conformance
- Contract revision required: no

## Runtime Updates
- Runtime evidence depth: open-act-mutate-persist-recover
- Critical scenario smoke-only warnings: none

## Plan Conformance Review
| Plan Item | Required | Actual | Result | Required Action |
|-----------|----------|--------|--------|-----------------|
| Ink package | ink/react package renderer | TypeScript string boundary | pass | none |
| SCN-22-1 | fullscreen screen behavior | Ink app compiles and fullscreen snapshot stable | pass | none |

## Workflow Execution
- Selected bundles: ready-isolate-bundle, implementation-bundle, review-bundle, verification-bundle, finish-bundle
- Applied skills: implementation-runner, codex-review-code, code-simplifier, completion-verifier
- Skipped skills: doc-auto-sync (not needed), session-logger (clean completion path)
- Selected harness components: phase-runner, contract, implementation, review, verification, finish
- Skipped harness components: none
- Selection reason: phase runner boundary fixture uses the full phase harness
- Runtime isolation: isolated boundary fixture
- Model effort profile: economy
- Effort escalation reason: none
- Selected model provider: openai
- Selected model: gpt-5.4-nano
- Selected model effort: low
- Model selection reason: phase-runner boundary fixture
- Retrieval budget: stage=1 compact recall; stopWhenAnswerable=true; no raw graph or memory output
- Validation profile: workflow_core
- Phase replay policy: preserve assistant phase commentary/final_answer when replaying; never add phase to user items

## Finish Readiness
- Fresh evidence confirmed: yes
- Source plan conformance confirmed: yes
- Why this round may stop now: clean-finish conditions are satisfied.
- Remaining in-scope work: none
- Remaining blockers before closeout: none
EOF

cat > "$CONFORMANCE_PHASE_DIR/SCORECARD.md" <<'EOF'
# Phase 22 Scorecard

## Objective Checklist
| ID | Category | Weight | Status | Evidence | Notes |
|----|----------|--------|--------|----------|-------|
| OBJ-CONFORM | Source phase plan conformance verified | 20 | pass | QA_REPORT.md | claimed |

## Score Summary
- Current score: 100
- Target score: 100
- Unmet checklist items: 0
- Blocking defects: 0
- Verdict: done

## Task-Level Status Adapter
- Current task status: FULL
EOF

cat > "$CONFORMANCE_PHASE_DIR/HANDOFF.md" <<'EOF'
# Phase 22 Handoff

## Status
- Required: no

## Resume Trigger
- Stop reason: phase_complete
EOF

set +e
(
  cd "$CONFORMANCE_WORKSPACE"
  node "$ROOT_DIR/.claude/scripts/verify-plan-conformance.mjs" \
    --phase-doc docs/implementation/22-ink-fullscreen-tui-v1.md \
    --sprint-contract docs/implementation/execution/22-ink-fullscreen-tui/SPRINT_CONTRACT.md \
    --qa-report docs/implementation/execution/22-ink-fullscreen-tui/QA_REPORT.md \
    --scorecard docs/implementation/execution/22-ink-fullscreen-tui/SCORECARD.md \
    --handoff docs/implementation/execution/22-ink-fullscreen-tui/HANDOFF.md > "$TMP_ROOT/conformance-fail.out" 2>&1
)
CONFORMANCE_STATUS=$?
set -e

if [[ "$CONFORMANCE_STATUS" -eq 0 ]]; then
  echo "FAIL: source plan mismatch should fail plan conformance" >&2
  cat "$TMP_ROOT/conformance-fail.out" >&2
  exit 1
fi
assert_contains "$TMP_ROOT/conformance-fail.out" "required-package-missing" "missing ink/react package conformance failure"
assert_contains "$TMP_ROOT/conformance-fail.out" "unapproved-deferred-scope" "unapproved deferred scope conformance failure"

GATE_OUTPUT="$(
  cd "$CONFORMANCE_WORKSPACE"
  node "$ROOT_DIR/.claude/scripts/agent-loop-phase-state.mjs" evaluate-phase-completion-gate \
    0 \
    docs/implementation/execution/22-ink-fullscreen-tui/QA_REPORT.md \
    docs/implementation/execution/22-ink-fullscreen-tui/SCORECARD.md \
    docs/implementation/execution/22-ink-fullscreen-tui \
    true \
    100 \
    docs/implementation/execution/22-ink-fullscreen-tui/HANDOFF.md
)"
assert_text_contains "$GATE_OUTPUT" "PHASE_PLAN_CONFORMANCE_ALLOWED='false'" "completion gate conformance denial"

mkdir -p "$CONFORMANCE_WORKSPACE/packages/tui/src"
cat > "$CONFORMANCE_WORKSPACE/packages/tui/package.json" <<'EOF'
{"dependencies":{"ink":"latest","react":"latest"}}
EOF
touch "$CONFORMANCE_WORKSPACE/packages/tui/src/fullscreen-app.tsx" "$CONFORMANCE_WORKSPACE/packages/tui/src/screens.tsx"
perl -0pi -e 's/String runtime boundary completed without adding external Ink package./Ink package renderer completed. Ink app compiles./; s/TypeScript string boundary/Ink app compiles/' "$CONFORMANCE_PHASE_DIR/QA_REPORT.md"
perl -0pi -e 's/Stop reason: phase_complete/Stop reason: phase_local_closeout_marker/' "$CONFORMANCE_PHASE_DIR/HANDOFF.md"

(
  cd "$CONFORMANCE_WORKSPACE"
  node "$ROOT_DIR/.claude/scripts/verify-plan-conformance.mjs" \
    --phase-doc docs/implementation/22-ink-fullscreen-tui-v1.md \
    --sprint-contract docs/implementation/execution/22-ink-fullscreen-tui/SPRINT_CONTRACT.md \
    --qa-report docs/implementation/execution/22-ink-fullscreen-tui/QA_REPORT.md \
    --scorecard docs/implementation/execution/22-ink-fullscreen-tui/SCORECARD.md \
    --handoff docs/implementation/execution/22-ink-fullscreen-tui/HANDOFF.md > "$TMP_ROOT/conformance-pass.out"
)
assert_contains "$TMP_ROOT/conformance-pass.out" "Status: pass" "positive plan conformance pass"

assert_contains "$ROOT_DIR/.claude/templates/execution/PHASE_COORDINATOR_CONTRACT.md" "do not emit final, closeout, or session-ended wording" "coordinator contract final guard"
assert_contains "$ROOT_DIR/.claude/templates/execution/PHASE_COORDINATOR_CONTRACT.md" "If Phase 01 just became completed but Phase 02+" "coordinator contract next phase guard"
assert_text_not_contains "$(cat "$ROOT_DIR/.claude/templates/execution/HANDOFF.template.md")" "clean_finish" "handoff template clean_finish stop reason"
assert_contains "$ROOT_DIR/.claude/templates/execution/SPRINT_CONTRACT.template.md" "Source Plan Requirements Snapshot" "sprint template source snapshot"
assert_contains "$ROOT_DIR/.claude/templates/execution/QA_REPORT.template.md" "Plan Conformance Review" "qa template plan conformance"
assert_contains "$ROOT_DIR/.claude/templates/execution/SCORECARD.template.md" "OBJ-CONFORM" "scorecard conformance objective"

echo "PASS: verify-phase-runner-boundary"
