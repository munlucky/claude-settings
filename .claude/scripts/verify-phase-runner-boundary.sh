#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/phase-runner-boundary.XXXXXX")"
trap 'rm -rf "$TMP_ROOT"' EXIT

PLAN_DIR="$TMP_ROOT/plan"
EXECUTION_ROOT="$PLAN_DIR/execution"
STATUS_FILE="$TMP_ROOT/phase-status.yaml"
LOG_DIR="$TMP_ROOT/logs"
FAKE_BIN="$TMP_ROOT/bin"
DISPATCH_OUT="$TMP_ROOT/dispatch.out"
NOENV_WORKSPACE="$TMP_ROOT/noenv-workspace"
NOENV_STATUS_FILE="$TMP_ROOT/noenv-phase-status.yaml"

mkdir -p "$PLAN_DIR" "$EXECUTION_ROOT" "$LOG_DIR" "$FAKE_BIN" "$NOENV_WORKSPACE/.claude/logs/workflow-enforcement"

cat > "$PLAN_DIR/00-master-plan-v1.md" <<'EOF'
# Boundary Smoke Plan
EOF

write_pending_status() {
  cat > "$STATUS_FILE" <<EOF
planDir: "$PLAN_DIR"
executionMode: in-session-coordinator
executionRoot: "$EXECUTION_ROOT"
phases:
  - number: 1
    title: "Smoke Phase"
    status: pending
    planConfirmed: true
EOF
}

write_completed_status() {
  cat > "$STATUS_FILE" <<EOF
planDir: "$PLAN_DIR"
executionMode: delegated-terminal
executionRoot: "$EXECUTION_ROOT"
phases:
  - number: 1
    title: "Smoke Phase"
    status: completed
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

cat > "$FAKE_BIN/claude" <<'EOF'
#!/usr/bin/env bash
if [[ "${1:-}" == "--help" ]]; then
  exit 0
fi
echo "fake claude clean exit"
exit 0
EOF
chmod +x "$FAKE_BIN/claude"

write_pending_status

set +e
PATH="$FAKE_BIN:$PATH" \
WORKFLOW_ENFORCEMENT_LOG_DIR="$LOG_DIR" \
PHASE_DISPATCH_KILL_STALE=false \
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

assert_contains "$DISPATCH_OUT" "Restarting coordinator (1/1)" "coordinator restart guard"
assert_contains "$DISPATCH_OUT" "Stopping to avoid an infinite restart loop." "restart cap failure"
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
assert_contains "$DISPATCH_ACTIVE_LEASE" "\"status\": \"finished\"" "dispatch lease finish state"
assert_contains "$DISPATCH_CURRENT_RUN" "\"phaseRunLease\"" "current-run phase lease mirror"
assert_contains "$DISPATCH_CURRENT_RUN" "\"stopReasonCode\": \"in-session-coordinator-restart-cap\"" "current-run stop reason"

WORKFLOW_ENFORCEMENT_LOG_DIR="$LOG_DIR" \
node "$ROOT_DIR/.claude/scripts/phase-run-lease.mjs" start \
  "$STATUS_FILE" \
  lease-smoke \
  delegated-terminal \
  "$PLAN_DIR" \
  "$EXECUTION_ROOT" \
  claude \
  "$PLAN_DIR/00-master-plan-v1.md" \
  "$$" >/dev/null

DENIED_OUTPUT="$(WORKFLOW_ENFORCEMENT_LOG_DIR="$LOG_DIR" node "$ROOT_DIR/.claude/scripts/phase-run-lease.mjs" assert-return-allowed "$STATUS_FILE" lease-smoke true false)"
assert_text_contains "$DENIED_OUTPUT" "RETURN_ALLOWED='false'" "active lease return denial"
assert_text_contains "$DENIED_OUTPUT" "RETURN_REASON='actionable-phases-remaining'" "active lease denial reason"

WORKFLOW_ENFORCEMENT_LOG_DIR="$LOG_DIR" \
node "$ROOT_DIR/.claude/scripts/phase-run-lease.mjs" finish \
  "$STATUS_FILE" \
  lease-smoke \
  summary \
  premature-return \
  completed-phase-only \
  failed >/dev/null

INACTIVE_OUTPUT="$(WORKFLOW_ENFORCEMENT_LOG_DIR="$LOG_DIR" node "$ROOT_DIR/.claude/scripts/phase-run-lease.mjs" assert-return-allowed "$STATUS_FILE" lease-smoke true false)"
assert_text_contains "$INACTIVE_OUTPUT" "RETURN_ALLOWED='false'" "finished lease return denial"
assert_text_contains "$INACTIVE_OUTPUT" "RETURN_REASON='inactive-run-lease-with-actionable-phases'" "inactive lease denial reason"

write_completed_status

ALLOWED_OUTPUT="$(WORKFLOW_ENFORCEMENT_LOG_DIR="$LOG_DIR" node "$ROOT_DIR/.claude/scripts/phase-run-lease.mjs" assert-return-allowed "$STATUS_FILE" lease-smoke true false)"
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

if ! compgen -G "$NOENV_WORKSPACE/.claude/logs/workflow-enforcement/active-phase-run-*.json" >/dev/null; then
  echo "FAIL: non-default status file did not create namespaced active lease file" >&2
  exit 1
fi

if ! compgen -G "$NOENV_WORKSPACE/.claude/logs/workflow-enforcement/current-run-*.json" >/dev/null; then
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
assert_text_contains "$PROMPT_OUTPUT" "---HANDOFF---" "prompt handoff separator"
assert_text_contains "$PROMPT_OUTPUT" "Current stage: Finish / Handoff" "seeded handoff stage"
assert_text_contains "$PROMPT_OUTPUT" "placeholder handoff seeded before the first stop or clean-finish update" "seeded handoff placeholder reason"

echo "PASS: verify-phase-runner-boundary"
