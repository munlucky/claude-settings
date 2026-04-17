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

mkdir -p "$PLAN_DIR" "$EXECUTION_ROOT" "$LOG_DIR" "$FAKE_BIN"

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

node "$ROOT_DIR/.claude/scripts/phase-run-lease.mjs" start \
  "$STATUS_FILE" \
  lease-smoke \
  delegated-terminal \
  "$PLAN_DIR" \
  "$EXECUTION_ROOT" \
  claude \
  "$PLAN_DIR/00-master-plan-v1.md" \
  "$$" >/dev/null

DENIED_OUTPUT="$(node "$ROOT_DIR/.claude/scripts/phase-run-lease.mjs" assert-return-allowed "$STATUS_FILE" lease-smoke true false)"
assert_text_contains "$DENIED_OUTPUT" "RETURN_ALLOWED='false'" "active lease return denial"
assert_text_contains "$DENIED_OUTPUT" "RETURN_REASON='actionable-phases-remaining'" "active lease denial reason"

node "$ROOT_DIR/.claude/scripts/phase-run-lease.mjs" finish \
  "$STATUS_FILE" \
  lease-smoke \
  summary \
  premature-return \
  completed-phase-only \
  failed >/dev/null

INACTIVE_OUTPUT="$(node "$ROOT_DIR/.claude/scripts/phase-run-lease.mjs" assert-return-allowed "$STATUS_FILE" lease-smoke true false)"
assert_text_contains "$INACTIVE_OUTPUT" "RETURN_ALLOWED='false'" "finished lease return denial"
assert_text_contains "$INACTIVE_OUTPUT" "RETURN_REASON='inactive-run-lease-with-actionable-phases'" "inactive lease denial reason"

write_completed_status

ALLOWED_OUTPUT="$(node "$ROOT_DIR/.claude/scripts/phase-run-lease.mjs" assert-return-allowed "$STATUS_FILE" lease-smoke true false)"
assert_text_contains "$ALLOWED_OUTPUT" "RETURN_ALLOWED='true'" "plan completion return allow"
assert_text_contains "$ALLOWED_OUTPUT" "RETURN_REASON='plan_directory_complete'" "plan completion allow reason"

PROMPT_OUTPUT="$(PLAN_DIR="$PLAN_DIR" EXECUTION_ROOT="$EXECUTION_ROOT" node --input-type=module <<'EOF'
import { assignExecutionArtifactPaths, buildPhasePrompt } from './.claude/scripts/agent-loop-phase-plan-lib.mjs';

const planDir = process.env.PLAN_DIR;
const executionRoot = process.env.EXECUTION_ROOT;
const paths = assignExecutionArtifactPaths(2, 'Smoke Phase', executionRoot);

console.log(buildPhasePrompt({
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
EOF
)"
assert_text_contains "$PROMPT_OUTPUT" "do not send a final answer" "prompt final-answer guard"
assert_text_contains "$PROMPT_OUTPUT" "activeExecutionStatus" "prompt status-file re-read guard"
assert_text_contains "$PROMPT_OUTPUT" "A completed phase, refreshed artifacts, or a successful checkpoint inside the active plan directory is not a valid final-response boundary by itself." "prompt boundary guard"

echo "PASS: verify-phase-runner-boundary"
