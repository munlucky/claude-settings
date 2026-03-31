#!/bin/bash
# =============================================================================
# Agent Loop - Phase-based Autonomous Execution
# =============================================================================
# Runs moonshot-phase-runner in a loop, each iteration as a separate session.
# Called from within Claude Code main session.
#
# Usage:
#   ./agent-loop.sh <plan-dir> [options]
#
# Arguments:
#   plan-dir          Directory containing master plan and phase documents
#
# Options:
#   --status-file     Path to phase-status.yaml (default: .claude/docs/phase-status.yaml)
#   --execution-root  Directory for execution bridge artifacts (default: <plan-dir>/execution)
#   --runtime         Runner CLI: auto|claude|codex (default: auto)
#   --max-phases N    Maximum phases to run (default: all)
#   --delay N         Delay between phases in seconds (default: 3)
#   --dry-run         Print what would be executed without running
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/runtime-cli.sh"
runtime_cli_prepare_environment

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
PLAN_DIR=""
STATUS_FILE=".claude/docs/phase-status.yaml"
EXECUTION_ROOT=""
RUNNER_RUNTIME="auto"
MAX_PHASES=0
DELAY_SECONDS=3
DRY_RUN=false
LOG_DIR=".claude/logs/agent-loop"
DECISION_LOG=".claude/logs/agent-loop/decisions.md"
SUMMARY_REPORT=".claude/logs/agent-loop/summary.md"
WORKFLOW_LOG_DIR=".claude/logs/workflow-enforcement"
WATCHDOG_CHECK_SECONDS=60
WATCHDOG_MAX_SECONDS=$((2 * 60 * 60))
WATCHDOG_AUTO_RESTART=true
# 0 = unlimited restarts
WATCHDOG_MAX_RESTARTS=0
VERIFICATION_CONTRACT_FILE=".claude/verification.contract.yaml"

# Autonomous Mode (default: true)
# When enabled, Claude will make autonomous decisions without user confirmation
AUTONOMOUS_MODE=true
# Max auto-fix attempts before moving to next phase
MAX_AUTO_FIX_ATTEMPTS="${AGENT_LOOP_MAX_AUTO_FIX_ATTEMPTS:-3}"
RUN_COMMIT_PROMPT="${AGENT_LOOP_RUN_COMMIT_PROMPT:-false}"
SKIP_COMMIT_PROMPT="${AGENT_LOOP_SKIP_COMMIT_PROMPT:-false}"
WATCHDOG_CHECK_SECONDS="${AGENT_LOOP_WATCHDOG_CHECK_SECONDS:-$WATCHDOG_CHECK_SECONDS}"
WATCHDOG_MAX_SECONDS="${AGENT_LOOP_WATCHDOG_MAX_SECONDS:-$WATCHDOG_MAX_SECONDS}"
CODEX_REASONING_EFFORT="${AGENT_LOOP_CODEX_REASONING_EFFORT:-${MOONSHOT_CODEX_REASONING_EFFORT:-medium}}"
ADVANCE_ON_FAILURE="${AGENT_LOOP_ADVANCE_ON_FAILURE:-false}"
SCORECARD_REQUIRED="${AGENT_LOOP_SCORECARD_REQUIRED:-true}"
TARGET_COMPLETION_SCORE="${AGENT_LOOP_TARGET_COMPLETION_SCORE:-100}"
SCORECARD_PROFILE="${AGENT_LOOP_SCORECARD_PROFILE:-auto}"

# -----------------------------------------------------------------------------
# Helper Functions
# -----------------------------------------------------------------------------

log_phase() {
    echo -e "${CYAN}📦${NC} $1"
}

log_success() {
    echo -e "${GREEN}✅${NC} $1"
}

log_error() {
    echo -e "${RED}❌${NC} $1"
}

log_info() {
    echo -e "${BLUE}ℹ️${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}⚠️${NC} $1"
}

file_checksum_or_empty() {
    local path="$1"
    if [[ ! -f "$path" ]]; then
        echo ""
        return
    fi

    if command -v shasum >/dev/null 2>&1; then
        shasum "$path" | awk '{print $1}'
        return
    fi

    python3 - "$path" <<'PY'
import hashlib
import sys

with open(sys.argv[1], "rb") as handle:
    print(hashlib.sha1(handle.read()).hexdigest())
PY
}

show_help() {
    head -22 "$0" | tail -17
    exit 0
}

# -----------------------------------------------------------------------------
# Parse Arguments
# -----------------------------------------------------------------------------

# First positional argument is plan directory
if [[ $# -gt 0 && ! "$1" =~ ^-- ]]; then
    PLAN_DIR="$1"
    shift
fi

while [[ $# -gt 0 ]]; do
    case $1 in
        --status-file)
            STATUS_FILE="$2"
            shift 2
            ;;
        --execution-root)
            EXECUTION_ROOT="$2"
            shift 2
            ;;
        --runtime)
            RUNNER_RUNTIME="$2"
            shift 2
            ;;
        --max-phases)
            MAX_PHASES="$2"
            shift 2
            ;;
        --delay)
            DELAY_SECONDS="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help|-h)
            show_help
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            ;;
    esac
done

# -----------------------------------------------------------------------------
# Validation
# -----------------------------------------------------------------------------

if [[ -z "$PLAN_DIR" ]]; then
    log_error "Plan directory not specified"
    echo "Usage: ./agent-loop.sh <plan-dir> [options]"
    exit 1
fi

if [[ ! -d "$PLAN_DIR" ]]; then
    log_error "Plan directory not found: $PLAN_DIR"
    exit 1
fi

if [[ -z "$EXECUTION_ROOT" ]]; then
    EXECUTION_ROOT="${PLAN_DIR%/}/execution"
fi

MASTER_PLAN=$(find "$PLAN_DIR" -name "*master*" -o -name "*00-*" 2>/dev/null | head -1)
if [[ -z "$MASTER_PLAN" ]]; then
    log_error "Master plan not found in: $PLAN_DIR"
    exit 1
fi

resolve_runner_runtime() {
    if [[ "$RUNNER_RUNTIME" == "claude" || "$RUNNER_RUNTIME" == "codex" ]]; then
        echo "$RUNNER_RUNTIME"
        return
    fi

    if command -v codex >/dev/null 2>&1; then
        echo "codex"
        return
    fi

    if command -v claude >/dev/null 2>&1; then
        echo "claude"
        return
    fi

    log_error "Neither Codex CLI nor Claude CLI was found"
    exit 1
}

run_worker_prompt() {
    local log_file="$1"
    local prompt="$2"
    local phase_start_epoch="$3"
    local qa_checksum_before="$4"
    local -a cmd=()
    local -a phase_env=()

    if [[ -n "${PHASE_SCORECARD:-}" ]]; then
        phase_env+=("HARNESS_SCORECARD_FILE=$PHASE_SCORECARD")
    fi
    if [[ -n "${PHASE_QA_REPORT:-}" ]]; then
        phase_env+=("HARNESS_QA_REPORT_FILE=$PHASE_QA_REPORT")
    fi
    if [[ -n "${EXECUTION_ROOT:-}" ]]; then
        phase_env+=("HARNESS_REQUIREMENTS_TRACEABILITY_FILE=${EXECUTION_ROOT}/REQUIREMENTS_TRACEABILITY.md")
        phase_env+=("HARNESS_SCENARIO_MATRIX_FILE=${EXECUTION_ROOT}/SCENARIO_MATRIX.md")
        phase_env+=("HARNESS_UAT_CHECKLIST_FILE=${EXECUTION_ROOT}/UAT_CHECKLIST.md")
    fi

    case "$RUNNER_RUNTIME" in
        claude)
            cmd=(env "${phase_env[@]}" claude --dangerously-skip-permissions --no-session-persistence -p "$prompt")
            ;;
        codex)
            cmd=(env "${phase_env[@]}" codex exec --full-auto -C "$PWD")
            if [[ -n "$CODEX_REASONING_EFFORT" ]]; then
                cmd+=(-c "model_reasoning_effort=\"$CODEX_REASONING_EFFORT\"")
            fi
            cmd+=("$prompt")
            ;;
        *)
            log_error "Unsupported runtime: $RUNNER_RUNTIME"
            return 1
            ;;
    esac

    run_worker_prompt_with_completion_gate "$log_file" "$phase_start_epoch" "$qa_checksum_before" "${cmd[@]}"
}

run_commit_prompt() {
    local log_file="$1"
    local prompt="$2"

    if [[ "$RUN_COMMIT_PROMPT" != "true" ]]; then
        log_info "Commit prompt disabled by policy (set AGENT_LOOP_RUN_COMMIT_PROMPT=true to opt in)"
        return 0
    fi

    if [[ "$SKIP_COMMIT_PROMPT" == "true" ]]; then
        log_info "Commit prompt skipped (AGENT_LOOP_SKIP_COMMIT_PROMPT=true)"
        return 0
    fi

    case "$RUNNER_RUNTIME" in
        claude)
            log_info "Running commit prompt via commit-moonshot (runtime: claude)"
            run_with_watchdog "$log_file" claude --dangerously-skip-permissions --no-session-persistence -c -p "$prompt" || true
            ;;
        codex)
            local -a cmd=(codex exec --full-auto -C "$PWD")
            if [[ -n "$CODEX_REASONING_EFFORT" ]]; then
                cmd+=(-c "model_reasoning_effort=\"$CODEX_REASONING_EFFORT\"")
            fi
            cmd+=("$prompt")
            log_info "Running commit prompt via commit-moonshot (runtime: codex)"
            run_with_watchdog "$log_file" "${cmd[@]}" || true
            ;;
        *)
            log_warn "Skipping commit prompt due to unsupported runtime: $RUNNER_RUNTIME"
            ;;
    esac
}

RUNNER_RUNTIME="$(resolve_runner_runtime)"

# Create log directory
mkdir -p "$LOG_DIR"
mkdir -p "$EXECUTION_ROOT"

# Initialize decision log
if [[ "$AUTONOMOUS_MODE" == "true" ]]; then
    echo "# Autonomous Decision Log" > "$DECISION_LOG"
    echo "" >> "$DECISION_LOG"
    echo "Generated: $(date '+%Y-%m-%d %H:%M:%S')" >> "$DECISION_LOG"
    echo "" >> "$DECISION_LOG"
fi

# -----------------------------------------------------------------------------
# Get Next Phase
# -----------------------------------------------------------------------------

get_next_phase() {
    if [[ -f "$STATUS_FILE" ]]; then
        python3 - "$STATUS_FILE" <<'PY'
import re
import sys

status_file = sys.argv[1]
with open(status_file, "r", encoding="utf-8") as handle:
    lines = handle.readlines()

blocks = []
current = None
for raw_line in lines:
    if re.match(r"^\s*-\s+number:\s*", raw_line):
        if current is not None:
            blocks.append(current)
        current = {"number": None, "status": None, "planConfirmed": None}
        match = re.search(r"number:\s*([0-9]+)", raw_line)
        if match:
            current["number"] = match.group(1)
        continue
    if current is None:
        continue
    stripped = raw_line.strip()
    if stripped.startswith("status:"):
        current["status"] = stripped.split(":", 1)[1].strip()
    elif stripped.startswith("planConfirmed:"):
        current["planConfirmed"] = stripped.split(":", 1)[1].strip().lower()

if current is not None:
    blocks.append(current)

for block in blocks:
    status = block.get("status")
    plan_confirmed = block.get("planConfirmed")
    if status in {"pending", "in_progress"} and plan_confirmed != "false":
        if block.get("number") is not None:
            print(block["number"])
            break
PY
    else
        echo "1"
    fi
}

get_phase_title() {
    local phase_num=$1
    local phase_prefix
    printf -v phase_prefix '%02d' "$phase_num"
    local phase_doc
    phase_doc=$(get_phase_doc "$phase_num")
    if [[ -n "$phase_doc" ]]; then
        head -5 "$phase_doc" | grep -E "^#" | head -1 | sed 's/^#* //'
    else
        echo "Phase $phase_num"
    fi
}

get_phase_doc() {
    local phase_num=$1
    local phase_prefix
    printf -v phase_prefix '%02d' "$phase_num"
    find "$PLAN_DIR" -maxdepth 1 \( -name "${phase_prefix}-*.md" -o -name "*phase*${phase_num}*" \) 2>/dev/null | head -1
}

sanitize_slug() {
    echo "$1" \
        | tr '[:upper:]' '[:lower:]' \
        | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//'
}

count_total_phases() {
    find "$PLAN_DIR" -maxdepth 1 -name "*.md" ! -name "*master*" ! -name "*00-*" 2>/dev/null | wc -l | tr -d ' '
}

render_required_verification_commands() {
    if [[ ! -f "$VERIFICATION_CONTRACT_FILE" ]] || ! command -v python3 >/dev/null 2>&1; then
        printf '%s\n' "- Populate from the active verification contract before claiming completion."
        return
    fi

    python3 - "$VERIFICATION_CONTRACT_FILE" <<'PY'
import sys


def parse_scalar(value):
    value = value.strip()
    if value in ("true", "false"):
        return value == "true"
    if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
        return value[1:-1]
    return value


def next_meaningful(lines, start_index):
    for idx in range(start_index + 1, len(lines)):
        stripped = lines[idx].strip()
        if not stripped or stripped.startswith("#"):
            continue
        indent = len(lines[idx]) - len(lines[idx].lstrip(" "))
        return indent, stripped
    return None, None


def parse_simple_yaml(path):
    with open(path, "r", encoding="utf-8") as handle:
        lines = handle.read().splitlines()

    root = {}
    stack = [(-1, root)]

    for index, raw_line in enumerate(lines):
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        indent = len(raw_line) - len(raw_line.lstrip(" "))
        while len(stack) > 1 and indent <= stack[-1][0]:
            stack.pop()

        container = stack[-1][1]

        if stripped.startswith("- "):
            if isinstance(container, list):
                container.append(parse_scalar(stripped[2:]))
            continue

        key, _, value = stripped.partition(":")
        key = key.strip()
        value = value.strip()
        if not key:
            continue

        if value == "":
            next_indent, next_stripped = next_meaningful(lines, index)
            nested = [] if next_indent is not None and next_indent > indent and next_stripped.startswith("- ") else {}
            if isinstance(container, dict):
                container[key] = nested
                stack.append((indent, nested))
            continue

        if isinstance(container, dict):
            container[key] = parse_scalar(value)

    return root


def as_list(value):
    if isinstance(value, list):
        return [item for item in value if isinstance(item, (str, int, float, bool))]
    if value in (None, ""):
        return []
    return [value]


contract = parse_simple_yaml(sys.argv[1])
commands = contract.get("commands", {}) if isinstance(contract.get("commands"), dict) else {}
policy = contract.get("policy", {}) if isinstance(contract.get("policy"), dict) else {}
required = [str(item) for item in as_list(policy.get("requiredChecks"))]

lines = []
for check_name in required:
    command = commands.get(check_name)
    if command:
        lines.append(f"- {check_name}: `{command}`")
    else:
        lines.append(f"- {check_name}: declare the command in {sys.argv[1]}")

if not lines:
    lines.append("- Populate from the active verification contract before claiming completion.")

print("\n".join(lines))
PY
}

ensure_execution_artifacts() {
    local phase_num="$1"
    local phase_title="$2"
    local phase_doc="$3"
    local phase_prefix
    local phase_slug
    local required_commands

    printf -v phase_prefix '%02d' "$phase_num"
    phase_slug=$(sanitize_slug "$phase_title")
    if [[ -z "$phase_slug" ]]; then
        phase_slug="phase-${phase_prefix}"
    fi

    PHASE_EXECUTION_DIR="${EXECUTION_ROOT}/${phase_prefix}-${phase_slug}"
    PHASE_SPRINT_CONTRACT="${PHASE_EXECUTION_DIR}/SPRINT_CONTRACT.md"
    PHASE_QA_REPORT="${PHASE_EXECUTION_DIR}/QA_REPORT.md"
    PHASE_HANDOFF="${PHASE_EXECUTION_DIR}/HANDOFF.md"
    PHASE_SCORECARD="${PHASE_EXECUTION_DIR}/SCORECARD.md"
    required_commands="$(render_required_verification_commands)"

    mkdir -p "$PHASE_EXECUTION_DIR"

    if [[ ! -f "$PHASE_SPRINT_CONTRACT" ]]; then
        cat > "$PHASE_SPRINT_CONTRACT" <<EOF
# Phase ${phase_prefix} Sprint Contract

> Seeded automatically by \`agent-loop.sh\`. Refresh before code changes.

## Slice
- Phase: ${phase_num}
- Title: ${phase_title}
- Source plan: ${MASTER_PLAN}
- Source phase doc: ${phase_doc}

## Round Goal
- Fill before code changes.

## Non-Goals
- Fill before code changes.

## Stage Order
- Ready / Isolate
- Execute
- Review
- Verify
- Finish / Handoff

## Planned Changes
- Files/modules:
- Interfaces/contracts:

## Policy Anchors
- Always-loaded rules: AGENTS.md, .claude/CLAUDE.md, .claude/rules/**
- Active workspace contract: .claude/PROJECT.md
- Verification contract: ${VERIFICATION_CONTRACT_FILE}
- Phase-specific guides: .claude/docs/guidelines/long-running-harness.md
- Round policy summary: Keep this run isolated to phase ${phase_prefix}, refresh QA/HANDOFF artifacts when state changes, and require fresh verification evidence before completion.

## Review Cadence
- First review checkpoint: After the first meaningful implementation batch for this phase.
- Re-review trigger: Any remediation round that changes behavior, contracts, or user-visible flows.
- Review owners: codex-review-code, plus targeted reviewers when needed.

## Done Checks
| Check | Type | Pass Condition |
|-------|------|----------------|
|  | UI/API/Test |  |

## Evaluator Focus
- Core flow:
- Edge cases:
- Stub-only behavior to reject:

## Evidence
### Required Verification Commands
${required_commands}

### Runtime Flow
- Fill before runtime verification.

### Artifacts
- QA report: ${PHASE_QA_REPORT}
- Handoff: ${PHASE_HANDOFF}
- Scorecard: ${PHASE_SCORECARD}

## Finish Rule
- Clean finish requires: fresh verification evidence, review complete, and finish-stage closeout recorded.
- Continue-now rule: if in-scope work remains and there is no blocker, interruption, user pause, or intentionally deferred verification, continue execution; checkpoint evidence alone is not a stop reason.
- Resume-later handoff trigger: blocked criteria, interruption, or intentionally deferred verification.
- Retry-loop trigger: verification or review returns actionable failures for this phase.
- Score target: ${TARGET_COMPLETION_SCORE}

## Risks
- Known uncertainty:
- Rollback or safe fallback:

## Notes
- Generated at: $(date '+%Y-%m-%d %H:%M:%S')
EOF
    fi

    if [[ ! -f "$PHASE_QA_REPORT" ]]; then
        cat > "$PHASE_QA_REPORT" <<EOF
# Phase ${phase_prefix} QA Report

> Updated by verifier/runtime steps. Seeded automatically by \`agent-loop.sh\`.

## Slice
- Phase: ${phase_num}
- Title: ${phase_title}
- Contract: ${PHASE_SPRINT_CONTRACT}

## Verdict
- Status: pending
- Summary: Awaiting implementation and verification.
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
|  | pending |  |

## Findings
| Severity | Area | Reproduction | Expected | Actual |
|----------|------|--------------|----------|--------|
|  |  |  |  |  |

## Runtime Updates
- Seeded at: $(date '+%Y-%m-%d %H:%M:%S')

## Workflow Execution
- Selected bundles: ready-isolate-bundle, implementation-bundle, review-bundle, verification-bundle, finish-bundle
- Applied skills: implementation-runner, completion-verifier
- Skipped skills: codex-review-code (review pending until the first meaningful implementation batch completes), code-simplifier (not evaluated yet), session-logger (clean completion path unless the phase stops without clean completion)
- Enforcement note: replace defaults when actual execution diverges

## Score Summary
- Current score: 0
- Target score: ${TARGET_COMPLETION_SCORE}
- Unmet checklist items: 1
- Blocking defects: 0
- Verdict: retry

## Finish Readiness
- Fresh evidence confirmed: no
- Why this round may stop now:
- Remaining in-scope work:
- Remaining blockers before closeout:
- Checks to rerun if code changes again:
EOF
    fi

    if [[ ! -f "$PHASE_SCORECARD" ]]; then
        if command -v python3 >/dev/null 2>&1 && [[ -f ".claude/scripts/render-scorecard.py" ]]; then
            python3 .claude/scripts/render-scorecard.py \
                --phase-prefix "$phase_prefix" \
                --phase-title "$phase_title" \
                --target-score "$TARGET_COMPLETION_SCORE" \
                --qa-report "$PHASE_QA_REPORT" \
                --profile "$SCORECARD_PROFILE" \
                --phase-doc "$phase_doc" \
                --requirements-file "${EXECUTION_ROOT}/REQUIREMENTS_TRACEABILITY.md" \
                --scenario-file "${EXECUTION_ROOT}/SCENARIO_MATRIX.md" \
                > "$PHASE_SCORECARD"
        else
            cat > "$PHASE_SCORECARD" <<EOF
# Phase ${phase_prefix} Scorecard

> Objective completion score for phase ${phase_prefix}. Update after every meaningful implementation or verification round.
> Preset profile: generic (fallback)
> Profile selection: fallback:no-renderer
> Coverage rebalance: counts:absent

## Objective Checklist
| ID | Category | Weight | Status | Evidence | Notes |
|----|----------|--------|--------|----------|-------|
| OBJ-REQ | In-scope requirements covered | 40 | pending | ${PHASE_QA_REPORT} | REQ-* coverage |
| OBJ-SCN | Critical scenarios evidenced | 30 | pending | ${PHASE_QA_REPORT} | SCN-* runtime or E2E evidence |
| OBJ-VER | Required verification commands passed | 20 | pending | ${PHASE_QA_REPORT} | Fresh contract-backed evidence |
| OBJ-CLOSE | Review and finish closeout recorded | 10 | pending | ${PHASE_QA_REPORT} | Review + finish evidence present |

## Score Summary
- Current score: 0
- Target score: ${TARGET_COMPLETION_SCORE}
- Unmet checklist items: 4
- Blocking defects: 0
- Verdict: retry

## Loop Policy
- \`done\` requires Current score >= Target score
- \`done\` requires Unmet checklist items = 0
- \`done\` requires Blocking defects = 0
- \`blocked\` means environment, contract, or dependency prevents progress
- \`retry\` means continue the active phase only
EOF
        fi
    fi
}

append_qa_runtime_update() {
    local status="$1"
    local log_file="$2"
    local detail="${3:-}"
    {
        echo ""
        echo "### $(date '+%Y-%m-%d %H:%M:%S')"
        echo "- Runtime status: ${status}"
        echo "- Log: ${log_file}"
        if [[ -n "$detail" ]]; then
            echo "- Detail: ${detail}"
        fi
        if [[ -f "${WORKFLOW_LOG_DIR}/latest-dispatch.json" ]]; then
            echo "- Workflow evidence: ${WORKFLOW_LOG_DIR}/latest-dispatch.json"
        fi
        if [[ -f "$PHASE_SCORECARD" ]]; then
            echo "- Scorecard: ${PHASE_SCORECARD}"
        fi
    } >> "$PHASE_QA_REPORT"
}

sync_clean_finish_artifacts() {
    local completion_artifacts="${1:-}"

    if [[ ! -f "$PHASE_QA_REPORT" ]] && [[ ! -f "$PHASE_SCORECARD" ]]; then
        return
    fi

    PHASE_COMPLETION_ARTIFACTS_TEXT="$completion_artifacts" \
    PHASE_QA_REPORT_PATH="$PHASE_QA_REPORT" \
    PHASE_SCORECARD_PATH="$PHASE_SCORECARD" \
    PHASE_TITLE_TEXT="$PHASE_TITLE" \
    PHASE_TARGET_COMPLETION_SCORE_VALUE="$TARGET_COMPLETION_SCORE" \
    python3 - <<'PY'
import json
import os
import re
from pathlib import Path

completion_artifacts = os.environ.get("PHASE_COMPLETION_ARTIFACTS_TEXT", "")
qa_report_path = Path(os.environ.get("PHASE_QA_REPORT_PATH", ""))
scorecard_path = Path(os.environ.get("PHASE_SCORECARD_PATH", ""))
phase_title = os.environ.get("PHASE_TITLE_TEXT", "Active phase")
target_score = int(os.environ.get("PHASE_TARGET_COMPLETION_SCORE_VALUE", "100"))


def find_verdict_path():
    for raw in completion_artifacts.splitlines():
        candidate = raw.strip()
        if not candidate or candidate == str(qa_report_path):
            continue
        path = Path(candidate)
        if path.exists() and path.suffix == ".json":
            return path
    return None


def replace_section(lines, heading, new_body):
    start = None
    end = len(lines)
    for idx, line in enumerate(lines):
        if line.strip() == heading:
            start = idx
            for probe in range(idx + 1, len(lines)):
                if lines[probe].startswith("## "):
                    end = probe
                    break
            break
    if start is None:
        return lines
    replacement = [heading, *new_body]
    return lines[:start] + replacement + lines[end:]


verdict_path = find_verdict_path()
verdict_payload = {}
if verdict_path is not None:
    try:
        verdict_payload = json.loads(verdict_path.read_text(encoding="utf-8"))
    except Exception:
        verdict_payload = {}

score = verdict_payload.get("score") or {}
current_score = int(score.get("current", target_score))
score_target = int(score.get("target", target_score))
unmet_items = int(score.get("unmetChecklistItems", score.get("unmetItems", 0)))
blocking_defects = int(score.get("blockingDefects", 0))
score_verdict = str(score.get("verdict", "done")).strip().lower() or "done"
commands = verdict_payload.get("commands") or []
command_runs = [entry.get("run", "").strip() for entry in commands if entry.get("run")]
command_summary = ", ".join(f"`{run}`" for run in command_runs) if command_runs else "fresh contract-backed verification commands"
verdict_relpath = verdict_path.as_posix() if verdict_path is not None else ""

if qa_report_path.exists():
    qa_lines = qa_report_path.read_text(encoding="utf-8").splitlines()
    qa_lines = replace_section(
        qa_lines,
        "## Verdict",
        [
            "- Status: passed",
            f"- Summary: {phase_title} completed cleanly with fresh verification evidence and final closeout synchronization.",
            "- Scope status: complete",
            "- Next path: clean_finish",
            "- Closeout reason: scope_complete",
            "",
        ],
    )

    updated_criteria = []
    in_criteria = False
    criteria_done = False
    for line in qa_lines:
        if line.strip() == "## Criteria Review":
            in_criteria = True
            updated_criteria.append(line)
            continue
        if in_criteria and line.startswith("## "):
            if not criteria_done:
                criteria_done = True
            in_criteria = False
        if in_criteria and line.startswith("|"):
            if re.search(r"Required verification", line, re.IGNORECASE):
                updated_criteria.append(f"| Required verification evidence | passed | {command_summary} passed and produced a structured verdict artifact. |")
                criteria_done = True
                continue
        updated_criteria.append(line)
    qa_lines = updated_criteria

    runtime_heading = "## Runtime Updates"
    runtime_start = None
    runtime_end = len(qa_lines)
    for idx, line in enumerate(qa_lines):
        if line.strip() == runtime_heading:
            runtime_start = idx
            for probe in range(idx + 1, len(qa_lines)):
                if qa_lines[probe].startswith("## "):
                    runtime_end = probe
                    break
            break
    if runtime_start is not None:
        section_lines = qa_lines[runtime_start:runtime_end]
        runtime_body = []
        saw_verdict_file = False
        saw_verdict = False
        for line in section_lines[1:]:
            stripped = line.strip()
            if stripped.startswith("- Verification verdict file:"):
                runtime_body.append(f"- Verification verdict file: {verdict_relpath}" if verdict_relpath else line)
                saw_verdict_file = True
            elif stripped.startswith("- Verification verdict:"):
                runtime_body.append("- Verification verdict: passed")
                saw_verdict = True
            else:
                runtime_body.append(line)
        if verdict_relpath and not saw_verdict_file:
            runtime_body.append(f"- Verification verdict file: {verdict_relpath}")
        if not saw_verdict:
            runtime_body.append("- Verification verdict: passed")
        qa_lines = qa_lines[:runtime_start] + [runtime_heading, *runtime_body] + qa_lines[runtime_end:]

    workflow_heading = "## Workflow Execution"
    workflow_start = None
    workflow_end = len(qa_lines)
    for idx, line in enumerate(qa_lines):
        if line.strip() == workflow_heading:
            workflow_start = idx
            for probe in range(idx + 1, len(qa_lines)):
                if qa_lines[probe].startswith("## "):
                    workflow_end = probe
                    break
            break
    if workflow_start is not None:
        workflow_body = qa_lines[workflow_start + 1:workflow_end]
        updated = []
        for line in workflow_body:
            stripped = line.strip()
            if stripped.startswith("- Applied skills:"):
                value = stripped.split(":", 1)[1].strip()
                skills = [item.strip() for item in value.split(",") if item.strip()]
                for skill in ("completion-verifier", "implementation-runner"):
                    if skill not in skills:
                        skills.append(skill)
                line = f"- Applied skills: {', '.join(skills)}"
            elif stripped.startswith("- Skipped skills:") and "completion-verifier" in stripped:
                value = stripped.split(":", 1)[1].strip()
                parts = [item.strip() for item in value.split(",") if item.strip()]
                parts = [part for part in parts if "completion-verifier" not in part]
                line = f"- Skipped skills: {', '.join(parts)}" if parts else "- Skipped skills: none"
            updated.append(line)
        qa_lines = qa_lines[:workflow_start + 1] + updated + qa_lines[workflow_end:]

    qa_lines = replace_section(
        qa_lines,
        "## Score Summary",
        [
            f"- Current score: {current_score}",
            f"- Target score: {score_target}",
            f"- Unmet checklist items: {unmet_items}",
            f"- Blocking defects: {blocking_defects}",
            f"- Verdict: {score_verdict}",
            "",
        ],
    )
    qa_lines = replace_section(
        qa_lines,
        "## Finish Readiness",
        [
            "- Fresh evidence confirmed: yes",
            "- Why this round may stop now: clean-finish conditions are satisfied and recorded.",
            "- Remaining in-scope work: none",
            "- Remaining blockers before closeout: none",
            f"- Checks to rerun if code changes again: {command_summary}",
            "",
        ],
    )
    qa_report_path.write_text("\n".join(qa_lines) + "\n", encoding="utf-8")

if scorecard_path.exists():
    score_lines = scorecard_path.read_text(encoding="utf-8").splitlines()
    updated_lines = []
    for line in score_lines:
        if line.startswith("| OBJ-"):
            parts = line.split("|")
            if len(parts) >= 6:
                parts[4] = " done "
                line = "|".join(parts)
        elif line.strip().startswith("- Current score:"):
            line = f"- Current score: {current_score}"
        elif line.strip().startswith("- Target score:"):
            line = f"- Target score: {score_target}"
        elif line.strip().startswith("- Unmet checklist items:"):
            line = f"- Unmet checklist items: {unmet_items}"
        elif line.strip().startswith("- Blocking defects:"):
            line = f"- Blocking defects: {blocking_defects}"
        elif line.strip().startswith("- Verdict:"):
            line = f"- Verdict: {score_verdict}"
        updated_lines.append(line)
    scorecard_path.write_text("\n".join(updated_lines) + "\n", encoding="utf-8")
PY
}

append_handoff_update() {
    local reason="$1"
    local log_file="$2"
    local detail="${3:-}"
    cat > "$PHASE_HANDOFF" <<EOF
# Phase $(printf '%02d' "$NEXT_PHASE") Handoff

> Generated because the phase stopped without clean completion.

## Goal
- ${PHASE_TITLE}
- Current stage: Finish / Handoff

## Current State
- Completed:
  - Latest sprint contract is at \`${PHASE_SPRINT_CONTRACT}\`
  - Latest QA state is at \`${PHASE_QA_REPORT}\`
- In progress:
  - No further work is active in this stopped attempt
- Blocked:
  - ${detail:-Runtime stop recorded by agent-loop}

## Resume Trigger
- Why this handoff exists: the current attempt did not reach clean finish
- Stop reason: ${reason}
- Why this cannot continue in the current round: runtime stop recorded by agent-loop; resume only after reviewing the active blockers, interruption, or deferred verification state.
- Condition to resume: review the latest contract and QA evidence, then continue only the active phase.

## Checks To Rerun
- Review: rerun review for any code changed in the next attempt
- Verification: rerun the required commands recorded in \`${PHASE_SPRINT_CONTRACT}\`
- Runtime flow: rerun the active phase flow only after the blocker above is addressed

## Next Steps
1. Review ${PHASE_SPRINT_CONTRACT}
2. Continue implementation or remediation for this phase only
3. Re-run verification and update ${PHASE_QA_REPORT}

## Remaining Scope
- Remaining in-scope work: resolve the current stop reason and finish the active phase with fresh verification evidence
- Next planned phase or slice: remain on the current phase until the scorecard reaches \`done\`

## Evidence Paths
- Sprint contract: ${PHASE_SPRINT_CONTRACT}
- QA report: ${PHASE_QA_REPORT}
- Phase doc: ${PHASE_DOC}
- Scorecard: ${PHASE_SCORECARD}
- Log: ${log_file}

## Workflow Logging
- session-logger: recorded via agent-loop handoff update
- Detail: ${detail:-none provided}
EOF
}

write_clean_finish_handoff() {
    local phase_num="$1"
    local phase_title="$2"
    local phase_doc="$3"
    local phase_prefix

    printf -v phase_prefix '%02d' "$phase_num"

    cat > "$PHASE_HANDOFF" <<EOF
# Phase ${phase_prefix} Handoff

> Not required after clean completion. Retained only as a closeout marker.

## Goal
- ${phase_title}
- Current stage: Finish / Handoff

## Status
- Required: no
- Reason: the phase completed cleanly with fresh verification evidence, recorded review state, and no pending resume work.

## Resume Trigger
- Why this handoff exists: clean-finish marker only
- Stop reason: clean_finish
- Why this cannot continue in the current round: no additional in-scope work remains for this phase
- Condition to resume: reopen only if a new change invalidates the current verification evidence

## Checks To Rerun
- Review: rerun only if code changes again
- Verification: rerun only if code changes again
- Runtime flow: not required for the current clean finish

## Remaining Scope
- Remaining in-scope work: none
- Next planned phase or slice: none in this handoff file

## Evidence Paths
- Sprint contract: ${PHASE_SPRINT_CONTRACT}
- QA report: ${PHASE_QA_REPORT}
- Phase doc: ${phase_doc}

## Workflow Logging
- session-logger: not required for this clean finish
- Closeout marker recorded at: $(date '+%Y-%m-%d %H:%M:%S')
EOF
}

build_phase_prompt() {
    local extra_instructions="${1:-}"
    local prompt_header="/moonshot-orchestrator"
    local codex_direct_steps=""

    if [[ "$RUNNER_RUNTIME" == "codex" ]]; then
        prompt_header="Moonshot orchestrator phase-attempt fallback for Codex
Treat this prompt as the direct equivalent of a /moonshot-orchestrator phase attempt."
        codex_direct_steps="
Codex direct execution checklist:
1. Read only the active phase doc and SPRINT_CONTRACT.md first.
2. Refresh SPRINT_CONTRACT.md for this attempt without broad repo inspection.
3. Execute only the active phase work.
4. Run review and verification in the phase contract order.
5. Use \`.claude/scripts/write-verification-verdict.py\` for structured \`.claude/verification-verdict-*.json\` output in the repository root instead of hand-authoring verdict JSON.
6. Record the exact repository-root verdict path in QA_REPORT.md as \`- Verification verdict file: .claude/verification-verdict-...\`.
7. Update QA_REPORT.md with runtime/mode, review state, and verification evidence.
8. Update SCORECARD.md with objective checklist status, score, unmet items, and verdict.
9. If verification passed, SCORECARD.md says \`Verdict: done\`, and finish-stage conditions are satisfied, stop immediately. If not, update HANDOFF.md and stop.

Do not spend time on extra planning, repo discovery, or alternative verifier selection before step 4.
Edit the artifact files directly with the runtime's file-edit tool. Do not use shell heredocs or inline apply_patch commands for these artifact updates."
    fi

    cat <<EOF
$prompt_header
phaseAttemptMode: true
phaseNumber: "$NEXT_PHASE"
phaseTitle: "$PHASE_TITLE"
planDir: "$PLAN_DIR"
activePhaseDocPath: "$PHASE_DOC"
phaseStatusFile: "$STATUS_FILE"
executionRoot: "$EXECUTION_ROOT"
executionArtifacts:
  sprintContractPath: "$PHASE_SPRINT_CONTRACT"
  qaReportPath: "$PHASE_QA_REPORT"
  handoffPath: "$PHASE_HANDOFF"
  scorecardPath: "$PHASE_SCORECARD"
  verificationVerdictGlob: ".claude/verification-verdict-*.json"

Single isolated phase-attempt rules:
- Treat this run as one isolated phase attempt only.
- Set signals.phaseAttemptMode = true.
- Set artifacts.activePhaseDocPath = "$PHASE_DOC".
- Reuse the provided execution artifact paths.
- Do not invoke moonshot-phase-runner again.
- Do not expand to other phases.
- Read the Policy Anchors section in SPRINT_CONTRACT.md first.
- Preserve the stage order \`ready/isolate -> execute -> review -> verify -> finish/handoff\`.
- Before code edits, refresh SPRINT_CONTRACT.md for this phase.
- Record review completion before claiming the verifier state is final.
- Generate fresh structured verification verdicts with \`.claude/scripts/write-verification-verdict.py\` and write them under \`.claude/verification-verdict-*.json\`; do not hand-author verdict JSON.
- Record the exact repository-root verdict path in QA_REPORT.md so the completion gate can confirm the same file.
- When verification runs, update QA_REPORT.md.
- Update SCORECARD.md on every meaningful round using objective checklist status, current score, unmet items, and verdict.
- Refresh the default values in the "Workflow Execution" section of QA_REPORT.md when actual execution diverges.
- If meaningful code changed, record \`code-simplifier\` in Applied skills or Skipped skills with a reason.
- If the run stops without clean completion, update HANDOFF.md, include \`session-logger\` evidence, and list the checks to rerun.
- Do not mark the phase done while SCORECARD.md says \`Verdict: retry\` or \`blocked\`.
- Do not mark the phase done while Current score is below ${TARGET_COMPLETION_SCORE}, Unmet checklist items > 0, or Blocking defects > 0.

Runtime compatibility fallback:
- If /moonshot-orchestrator is unavailable in this runtime, execute the equivalent phase-attempt workflow directly instead of searching for missing slash skills.
- In fallback mode, use only the active phase doc, SPRINT_CONTRACT.md, QA_REPORT.md, HANDOFF.md, SCORECARD.md, .claude/PROJECT.md, .claude/verification.contract.yaml, and .claude/docs/guidelines/long-running-harness.md unless the phase doc explicitly requires more.
- Do not inspect unrelated repository files once the required verification command and artifact updates are clear.
- Once fresh verification evidence exists, the execution artifacts reflect the outcome, and SCORECARD.md says \`Verdict: done\`, stop immediately and return control to the caller.
$codex_direct_steps

Additional instructions:
${extra_instructions}

$AUTONOMOUS_INSTRUCTIONS
EOF
}

evaluate_phase_completion_gate() {
    local phase_start_epoch="$1"
    local eval_output

    eval_output="$(PHASE_START_EPOCH="$phase_start_epoch" PHASE_QA_REPORT_PATH="$PHASE_QA_REPORT" PHASE_SCORECARD_PATH="$PHASE_SCORECARD" PHASE_EXECUTION_DIR="$PHASE_EXECUTION_DIR" PHASE_SCORECARD_REQUIRED="$SCORECARD_REQUIRED" PHASE_TARGET_COMPLETION_SCORE="$TARGET_COMPLETION_SCORE" python3 - <<'PY'
import glob
import json
import os
import shlex
import re

start_epoch = float(os.environ["PHASE_START_EPOCH"])
patterns = [
    ".claude/verification-verdict-*.json",
    ".claude/runtime-verdict-*.json",
]
qa_report_path = os.environ.get("PHASE_QA_REPORT_PATH", "")
scorecard_path = os.environ.get("PHASE_SCORECARD_PATH", "")
phase_execution_dir = os.environ.get("PHASE_EXECUTION_DIR", "")
scorecard_required = os.environ.get("PHASE_SCORECARD_REQUIRED", "true").lower() == "true"
target_score_default = int(os.environ.get("PHASE_TARGET_COMPLETION_SCORE", "100"))
qa_report_dir = os.path.dirname(qa_report_path) if qa_report_path else ""

if phase_execution_dir:
    patterns.extend([
        os.path.join(phase_execution_dir, "verification-verdict-*.json"),
        os.path.join(phase_execution_dir, "runtime-verdict-*.json"),
    ])


def resolve_candidate_path(raw_path):
    raw_path = (raw_path or "").strip()
    if not raw_path:
        return ""
    normalized = raw_path.strip().strip('"').strip("'")
    if not normalized:
        return ""
    if os.path.isabs(normalized):
        return normalized
    qa_relative = os.path.normpath(os.path.join(qa_report_dir or ".", normalized))
    if os.path.exists(qa_relative):
        return qa_relative
    root_relative = os.path.normpath(normalized)
    if os.path.exists(root_relative):
        return root_relative
    return qa_relative if qa_report_dir else root_relative

latest_by_script = {}
candidate_paths = set()
for pattern in patterns:
    for path in glob.glob(pattern):
        candidate_paths.add(path)

failures = []
passed_paths = []
code_change_detected = False

workflow_reason = "ok"
qa_fresh_evidence = False
qa_verdict_passed = False
qa_verification_lines = []
qa_verdict_paths = []
if qa_report_path:
    try:
        qa_lines = open(qa_report_path, "r", encoding="utf-8").read().splitlines()
    except OSError:
        qa_lines = []

    section = {}
    in_workflow = False
    current_heading = ""
    for line in qa_lines:
        stripped = line.strip()
        if stripped.startswith("## "):
            current_heading = stripped
        if line.strip() == "## Workflow Execution":
            in_workflow = True
            continue
        if in_workflow and line.startswith("## "):
            break
        if not in_workflow:
            continue
        stripped = line.strip()
        if stripped.startswith("- Selected bundles:"):
            section["selected"] = stripped.split(":", 1)[1].strip()
        elif stripped.startswith("- Applied skills:"):
            section["applied"] = stripped.split(":", 1)[1].strip()
        elif stripped.startswith("- Skipped skills:"):
            section["skipped"] = stripped.split(":", 1)[1].strip()

    current_heading = ""
    for line in qa_lines:
        stripped = line.strip()
        if stripped.startswith("## "):
            current_heading = stripped
            continue
        if current_heading == "## Verdict" and stripped.startswith("- Status:"):
            qa_verdict_passed = stripped.split(":", 1)[1].strip().lower() == "passed"
        elif current_heading == "## Finish Readiness" and stripped.startswith("- Fresh evidence confirmed:"):
            qa_fresh_evidence = stripped.split(":", 1)[1].strip().lower().startswith("yes")
        elif current_heading == "## Runtime Updates" and stripped.startswith("- Verification verdict file:"):
            verdict_path = stripped.split(":", 1)[1].strip()
            if verdict_path:
                qa_verdict_paths.append(verdict_path)
        elif current_heading == "## Runtime Updates" and stripped.startswith("- Verification verdict:"):
            if stripped.split(":", 1)[1].strip().lower() == "passed":
                qa_verification_lines.append(stripped)

    in_verification_evidence = False
    for line in qa_lines:
        stripped = line.strip()
        if stripped == "## Verification Evidence":
            in_verification_evidence = True
            continue
        if in_verification_evidence and line.startswith("## "):
            break
        if in_verification_evidence and stripped.startswith("- ") and "passed" in stripped.lower():
            qa_verification_lines.append(stripped)

    for verdict_path in qa_verdict_paths:
        resolved_path = resolve_candidate_path(verdict_path)
        if resolved_path:
            candidate_paths.add(resolved_path)

for path in sorted(candidate_paths):
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        continue
    if mtime + 1 < start_epoch:
        continue
    try:
        with open(path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except Exception:
        continue
    script = payload.get("script") or os.path.basename(path)
    previous = latest_by_script.get(script)
    if previous is None or mtime > previous[0]:
        latest_by_script[script] = (mtime, path, payload)

for script in sorted(latest_by_script):
    _mtime, path, payload = latest_by_script[script]
    verdict = payload.get("verdict")
    evidence_fresh = payload.get("evidenceFresh") is True
    contract = payload.get("contract") or {}
    verification_mode = payload.get("verificationMode") or contract.get("verificationMode") or ""
    contract_applicable = bool(contract.get("applicable"))
    missing_required = ((payload.get("requiredChecks") or {}).get("missing") or [])

    if verdict != "passed":
        failures.append(f"{script}:verdict={verdict}")
        continue
    if not evidence_fresh:
        failures.append(f"{script}:evidenceFresh=false")
        continue
    if (contract_applicable or verification_mode == "contract") and missing_required:
        failures.append(f"{script}:missingRequiredChecks")
        continue
    for changed_path in payload.get("changedFiles") or []:
        suffix = os.path.splitext(changed_path)[1].lower()
        if suffix in {
            ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".py", ".rb", ".go", ".rs",
            ".java", ".kt", ".kts", ".cs", ".php", ".swift", ".scala", ".sh", ".bash",
            ".zsh", ".ps1", ".psm1", ".c", ".cc", ".cpp", ".cxx", ".h", ".hh", ".hpp",
            ".hxx",
        }:
            code_change_detected = True
    passed_paths.append(path)

    if not section:
        workflow_reason = "workflow-section-missing"
    elif not section.get("selected"):
        workflow_reason = "workflow-selected-bundles-missing"
    elif not section.get("applied"):
        workflow_reason = "workflow-applied-skills-missing"
    elif not section.get("skipped"):
        workflow_reason = "workflow-skipped-skills-missing"
    elif code_change_detected and (
        "code-simplifier" not in section.get("applied", "")
        and (
            "code-simplifier" not in section.get("skipped", "")
            or "not evaluated yet" in section.get("skipped", "").lower()
        )
    ):
        workflow_reason = "workflow-code-simplifier-missing"

score_reason = "ok"
current_score = 0
target_score = target_score_default
unmet_items = 0
blocking_defects = 0
score_verdict = "missing"
score_source = "none"

latest_score_payload = None
for script in sorted(latest_by_script):
    _mtime, _path, payload = latest_by_script[script]
    score = payload.get("score")
    if isinstance(score, dict) and score.get("detected") is True:
        latest_score_payload = score

if latest_score_payload is not None:
    current_score = int(latest_score_payload.get("current", 0))
    target_score = int(latest_score_payload.get("target", target_score_default))
    unmet_items = int(latest_score_payload.get("unmetChecklistItems", 0))
    blocking_defects = int(latest_score_payload.get("blockingDefects", 0))
    score_verdict = str(latest_score_payload.get("verdict", "missing")).strip().lower().replace(" ", "_")
    score_source = "verifier-artifact"
elif scorecard_required:
    if not scorecard_path or not os.path.exists(scorecard_path):
        score_reason = "scorecard-missing"
    else:
        try:
            score_lines = open(scorecard_path, "r", encoding="utf-8").read().splitlines()
        except OSError:
            score_lines = []

        for line in score_lines:
            stripped = line.strip()
            match = re.match(r"^- Current score:\s*([0-9]+)\s*$", stripped)
            if match:
                current_score = int(match.group(1))
                continue
            match = re.match(r"^- Target score:\s*([0-9]+)\s*$", stripped)
            if match:
                target_score = int(match.group(1))
                continue
            match = re.match(r"^- Unmet checklist items:\s*([0-9]+)\s*$", stripped)
            if match:
                unmet_items = int(match.group(1))
                continue
            match = re.match(r"^- Blocking defects:\s*([0-9]+)\s*$", stripped)
            if match:
                blocking_defects = int(match.group(1))
                continue
            match = re.match(r"^- Verdict:\s*([A-Za-z_ -]+)\s*$", stripped)
            if match:
                score_verdict = match.group(1).strip().lower().replace(" ", "_")
        score_source = "scorecard-markdown"

if scorecard_required:
    if score_verdict != "done":
        score_reason = f"scorecard-verdict={score_verdict}"
    elif current_score < target_score:
        score_reason = "scorecard-score-below-target"
    elif unmet_items > 0:
        score_reason = "scorecard-unmet-items"
    elif blocking_defects > 0:
        score_reason = "scorecard-blocking-defects"

if not passed_paths and not failures and qa_fresh_evidence and (qa_verification_lines or qa_verdict_passed):
    passed_paths.append(qa_report_path or "qa-report-fallback")

allowed = bool(passed_paths) and not failures and workflow_reason == "ok" and score_reason == "ok"
reason = "ok" if allowed else (
    failures[0]
    if failures
    else workflow_reason
    if workflow_reason != "ok"
    else score_reason
    if score_reason != "ok"
    else "no-fresh-verification-artifact"
)

print(f"PHASE_COMPLETION_ALLOWED={'true' if allowed else 'false'}")
print(f"PHASE_COMPLETION_REASON={shlex.quote(reason)}")
print(f"PHASE_COMPLETION_ARTIFACTS={shlex.quote(chr(10).join(passed_paths))}")
print(f"PHASE_COMPLETION_SCORE={current_score}")
print(f"PHASE_COMPLETION_TARGET={target_score}")
print(f"PHASE_COMPLETION_UNMET={unmet_items}")
print(f"PHASE_COMPLETION_BLOCKERS={blocking_defects}")
print(f"PHASE_COMPLETION_SCORE_VERDICT={shlex.quote(score_verdict)}")
print(f"PHASE_COMPLETION_SCORE_SOURCE={shlex.quote(score_source)}")
PY
)"

    if [[ -n "$eval_output" ]]; then
        eval "$eval_output"
    else
        PHASE_COMPLETION_ALLOWED=false
        PHASE_COMPLETION_REASON="no-verification-evaluation"
        PHASE_COMPLETION_ARTIFACTS=""
    fi
}

evaluate_phase_completion_gate_with_retry() {
    local phase_start_epoch="$1"
    local retries="${2:-2}"
    local delay_seconds="${3:-2}"
    local attempt=0

    while true; do
        evaluate_phase_completion_gate "$phase_start_epoch"
        if [[ "$PHASE_COMPLETION_ALLOWED" == "true" ]]; then
            return 0
        fi
        if [[ "$PHASE_COMPLETION_REASON" != "no-fresh-verification-artifact" ]]; then
            return 0
        fi
        if [[ $attempt -ge $retries ]]; then
            return 0
        fi
        attempt=$((attempt + 1))
        sleep "$delay_seconds"
    done
}

# Run a command with watchdog (no periodic output)
run_with_watchdog() {
    local log_file="$1"
    shift

    local start_time
    start_time=$(date +%s)
    local timed_out=false

    set +e
    "$@" >> "$log_file" 2>&1 &
    local pid=$!

    while kill -0 "$pid" 2>/dev/null; do
        local now
        now=$(date +%s)
        local elapsed=$((now - start_time))
        if [[ $WATCHDOG_MAX_SECONDS -gt 0 && $elapsed -ge $WATCHDOG_MAX_SECONDS ]]; then
            timed_out=true
            kill "$pid" 2>/dev/null
            sleep 5
            kill -9 "$pid" 2>/dev/null
            break
        fi
        sleep "$WATCHDOG_CHECK_SECONDS"
    done

    wait "$pid"
    local exit_code=$?
    set -e

    if [[ "$timed_out" == "true" ]]; then
        echo "WATCHDOG_TIMEOUT after ${WATCHDOG_MAX_SECONDS}s" >> "$log_file"
        return 124
    fi
    return "$exit_code"
}

run_worker_prompt_with_completion_gate() {
    local log_file="$1"
    local phase_start_epoch="$2"
    local qa_checksum_before="$3"
    shift 3

    local start_time
    start_time=$(date +%s)
    local timed_out=false
    local completed_early=false

    set +e
    "$@" >> "$log_file" 2>&1 &
    local pid=$!

    while kill -0 "$pid" 2>/dev/null; do
        local now
        now=$(date +%s)
        local elapsed=$((now - start_time))

        if [[ -n "$qa_checksum_before" ]]; then
            local qa_checksum_now
            qa_checksum_now="$(file_checksum_or_empty "$PHASE_QA_REPORT")"
            if [[ "$qa_checksum_now" != "$qa_checksum_before" ]]; then
                evaluate_phase_completion_gate "$phase_start_epoch"
                if [[ "$PHASE_COMPLETION_ALLOWED" == "true" ]]; then
                    completed_early=true
                    kill "$pid" 2>/dev/null
                    sleep 2
                    kill -9 "$pid" 2>/dev/null
                    break
                fi
            fi
        fi

        if [[ $WATCHDOG_MAX_SECONDS -gt 0 && $elapsed -ge $WATCHDOG_MAX_SECONDS ]]; then
            timed_out=true
            kill "$pid" 2>/dev/null
            sleep 5
            kill -9 "$pid" 2>/dev/null
            break
        fi

        sleep "$WATCHDOG_CHECK_SECONDS"
    done

    wait "$pid"
    local exit_code=$?
    set -e

    if [[ "$completed_early" == "true" ]]; then
        echo "EARLY_COMPLETION_GATE satisfied; worker terminated after fresh verification evidence." >> "$log_file"
        return 0
    fi

    if [[ "$timed_out" == "true" ]]; then
        echo "WATCHDOG_TIMEOUT after ${WATCHDOG_MAX_SECONDS}s" >> "$log_file"
        return 124
    fi

    return "$exit_code"
}

# Update phase status in phase-status.yaml (best-effort)
update_phase_state() {
    local phase_num="$1"
    local new_status="$2"
    local timestamp="$3"
    local last_outcome="${4:-}"
    local increment_attempt="${5:-false}"
    local active_phase_doc="${6:-}"
    local sprint_contract_path="${7:-}"
    local qa_report_path="${8:-}"
    local handoff_path="${9:-}"
    local scorecard_path="${10:-}"

    if [[ ! -f "$STATUS_FILE" ]] || ! command -v python3 >/dev/null 2>&1; then
        return
    fi

    python3 - "$STATUS_FILE" "$phase_num" "$new_status" "$timestamp" "$last_outcome" "$increment_attempt" "$active_phase_doc" "$sprint_contract_path" "$qa_report_path" "$handoff_path" "$scorecard_path" <<'PY'
import re
import sys

(
    status_file,
    target_num,
    new_status,
    timestamp,
    last_outcome,
    increment_attempt,
    active_phase_doc,
    sprint_contract_path,
    qa_report_path,
    handoff_path,
    scorecard_path,
) = sys.argv[1:]

with open(status_file, "r", encoding="utf-8") as handle:
    lines = handle.read().splitlines()

block_ranges = []
current_start = None
for idx, line in enumerate(lines):
    if re.match(r"^\s*-\s+number:\s*", line):
        if current_start is not None:
            block_ranges.append((current_start, idx))
        current_start = idx
if current_start is not None:
    block_ranges.append((current_start, len(lines)))

target_range = None
for start, end in block_ranges:
    match = re.search(r"number:\s*([0-9]+)", lines[start])
    if match and match.group(1) == target_num:
        target_range = (start, end)
        break

if target_range is None:
    raise SystemExit(0)

start, end = target_range
block = lines[start:end]
item_indent = len(block[0]) - len(block[0].lstrip(" "))
top_indent = " " * (item_indent + 2)
attempt_value_indent = " " * (item_indent + 4)


def set_top_level(key, value):
    prefix = f"{top_indent}{key}:"
    for idx, line in enumerate(block):
        if line.startswith(prefix):
            block[idx] = f"{prefix} {value}"
            return
    insert_at = len(block)
    for idx in range(1, len(block)):
        stripped = block[idx].lstrip(" ")
        indent = len(block[idx]) - len(stripped)
        if indent <= item_indent:
            insert_at = idx
            break
    block.insert(insert_at, f"{prefix} {value}")


def set_root_mapping_value(parent, child, value):
    parent_prefix = f"{parent}:"
    child_prefix = f"  {child}:"
    parent_idx = None
    parent_end = len(lines)
    for idx, line in enumerate(lines):
        if line.startswith(parent_prefix):
            parent_idx = idx
            for probe in range(idx + 1, len(lines)):
                stripped = lines[probe].lstrip(" ")
                indent = len(lines[probe]) - len(stripped)
                if indent == 0 and stripped:
                    parent_end = probe
                    break
            break
    if parent_idx is None:
        lines.extend([parent_prefix, f'{child_prefix} {value}'])
        return

    for idx in range(parent_idx + 1, parent_end):
        if lines[idx].startswith(child_prefix):
            lines[idx] = f'{child_prefix} {value}'
            return

    lines.insert(parent_end, f'{child_prefix} {value}')


def remove_root_key(parent):
    parent_prefix = f"{parent}:"
    for idx, line in enumerate(lines):
        if line.startswith(parent_prefix):
            end_idx = len(lines)
            for probe in range(idx + 1, len(lines)):
                stripped = lines[probe].lstrip(" ")
                indent = len(lines[probe]) - len(stripped)
                if indent == 0 and stripped:
                    end_idx = probe
                    break
            del lines[idx:end_idx]
            return


def ensure_attempts_block():
    prefix = f"{top_indent}attempts:"
    for idx, line in enumerate(block):
        if line.startswith(prefix):
            end_idx = len(block)
            for probe in range(idx + 1, len(block)):
                stripped = block[probe].lstrip(" ")
                indent = len(block[probe]) - len(stripped)
                if indent <= len(top_indent):
                    end_idx = probe
                    break
            return idx, end_idx

    insert_at = len(block)
    for idx in range(1, len(block)):
        stripped = block[idx].lstrip(" ")
        indent = len(block[idx]) - len(stripped)
        if indent <= item_indent:
            insert_at = idx
            break
    block[insert_at:insert_at] = [
        f"{top_indent}attempts:",
        f"{attempt_value_indent}total: 0",
        f"{attempt_value_indent}lastOutcome: pending",
        f'{attempt_value_indent}lastUpdatedAt: "{timestamp}"',
    ]
    return insert_at, insert_at + 4


def get_attempt_value(name, default="0"):
    start_idx, end_idx = ensure_attempts_block()
    prefix = f"{attempt_value_indent}{name}:"
    for idx in range(start_idx + 1, end_idx):
        if block[idx].startswith(prefix):
            return idx, block[idx].split(":", 1)[1].strip().strip('"')
    block.insert(end_idx, f"{prefix} {default}")
    return end_idx, default


set_top_level("status", new_status)
set_top_level("planConfirmed", "true")
if sprint_contract_path:
    set_top_level("sprintContract", f'"{sprint_contract_path}"')
if qa_report_path:
    set_top_level("qaReport", f'"{qa_report_path}"')
if handoff_path:
    set_top_level("handoff", f'"{handoff_path}"')
if scorecard_path:
    set_top_level("scorecard", f'"{scorecard_path}"')

if new_status == "completed":
    set_top_level("completedAt", f'"{timestamp}"')
else:
    completed_prefix = f"{top_indent}completedAt:"
    block[:] = [line for line in block if not line.startswith(completed_prefix)]

if increment_attempt.lower() == "true" or last_outcome:
    total_idx, total_value = get_attempt_value("total", "0")
    if increment_attempt.lower() == "true":
        try:
            total_number = int(total_value)
        except ValueError:
            total_number = 0
        block[total_idx] = f"{attempt_value_indent}total: {total_number + 1}"

    if last_outcome:
        outcome_idx, _ = get_attempt_value("lastOutcome", "pending")
        block[outcome_idx] = f"{attempt_value_indent}lastOutcome: {last_outcome}"

    updated_idx, _ = get_attempt_value("lastUpdatedAt", f'"{timestamp}"')
    block[updated_idx] = f'{attempt_value_indent}lastUpdatedAt: "{timestamp}"'

lines[start:end] = block

if new_status == "in_progress" and active_phase_doc:
    set_root_mapping_value("signals", "phaseAttemptMode", "true")
    set_root_mapping_value("artifacts", "activePhaseDocPath", f'"{active_phase_doc}"')
else:
    remove_root_key("signals")
    remove_root_key("artifacts")

with open(status_file, "w", encoding="utf-8") as handle:
    handle.write("\n".join(lines) + "\n")
PY
}

# -----------------------------------------------------------------------------
# Main Loop
# -----------------------------------------------------------------------------

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Agent Loop Started${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
log_info "Plan directory: $PLAN_DIR"
log_info "Master plan: $MASTER_PLAN"
log_info "Status file: $STATUS_FILE"
log_info "Execution root: $EXECUTION_ROOT"
log_info "Runtime: $RUNNER_RUNTIME"

TOTAL_PHASES=$(count_total_phases)
log_info "Total phases: $TOTAL_PHASES"
echo ""

completed=0
failed=0

while true; do
    NEXT_PHASE=$(get_next_phase)
    
    # Check if all done
    if [[ -z "$NEXT_PHASE" || "$NEXT_PHASE" == "" ]]; then
        break
    fi
    
    # Check max phases limit
    if [[ $MAX_PHASES -gt 0 && $completed -ge $MAX_PHASES ]]; then
        log_info "Reached max phases limit ($MAX_PHASES)"
        break
    fi
    
    PHASE_TITLE=$(get_phase_title "$NEXT_PHASE")
    PHASE_DOC=$(get_phase_doc "$NEXT_PHASE")
    TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
    LOGFILE="${LOG_DIR}/phase-${NEXT_PHASE}_${TIMESTAMP}.log"
    ensure_execution_artifacts "$NEXT_PHASE" "$PHASE_TITLE" "$PHASE_DOC"
    
    echo -e "${CYAN}───────────────────────────────────────────────────────────────${NC}"
    log_phase "Phase $NEXT_PHASE: $PHASE_TITLE"
    log_info "Sprint contract: $PHASE_SPRINT_CONTRACT"
    log_info "QA report: $PHASE_QA_REPORT"
    log_info "Handoff: $PHASE_HANDOFF"
    log_info "Scorecard: $PHASE_SCORECARD"
    
    # Build autonomous prompt
    if [[ "$AUTONOMOUS_MODE" == "true" ]]; then
        AUTONOMOUS_INSTRUCTIONS="
## 자율 실행 모드
- 사용자 확인 없이 최선의 판단으로 자율적으로 진행하세요
- 불확실한 경우 보수적이고 안전한 선택을 하세요
- 모든 결정사항은 간략히 기록해주세요
- 실패 시 대안을 시도한 후 진행하세요
- 절대로 사용자에게 질문하거나 확인을 요청하지 마세요"
    else
        AUTONOMOUS_INSTRUCTIONS=""
    fi

    PHASE_PROMPT="$(build_phase_prompt "Implement phase $NEXT_PHASE using the active phase doc as the only planning baseline.

Primary objective:
- Complete the scoped work for phase $NEXT_PHASE.
- Keep changes bounded to the active phase.
- Do not move to other phases in this run.
- If the phase artifacts declare an exact verification command, run that command exactly once instead of searching for alternative verifiers.
- Once fresh verification evidence exists and the execution artifacts are updated, stop immediately and return control to the caller.")"
    
    # Execute worker session
    START_TIME=$(date +%s)
    restart_count=0
    auto_fix_count=0

    if [[ "$DRY_RUN" == "true" ]]; then
        log_warn "[DRY-RUN] Would execute phase $NEXT_PHASE"
        echo ""
        echo "----- Phase Attempt Prompt -----"
        printf '%s\n' "$PHASE_PROMPT"
        echo "----- End Prompt -----"
        completed=$((completed + 1))
        sleep 1
        continue
    fi
    
    while true; do
        update_phase_state "$NEXT_PHASE" "in_progress" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "running" "true" "$PHASE_DOC" "$PHASE_SPRINT_CONTRACT" "$PHASE_QA_REPORT" "$PHASE_HANDOFF" "$PHASE_SCORECARD"
        PHASE_QA_CHECKSUM_BEFORE="$(file_checksum_or_empty "$PHASE_QA_REPORT")"
        if run_worker_prompt "$LOGFILE" "$PHASE_PROMPT" "$START_TIME" "$PHASE_QA_CHECKSUM_BEFORE"; then
            
            END_TIME=$(date +%s)
            DURATION=$((END_TIME - START_TIME))
            evaluate_phase_completion_gate_with_retry "$START_TIME"

            if [[ "$PHASE_COMPLETION_ALLOWED" != "true" ]]; then
                auto_fix_count=$((auto_fix_count + 1))
                log_error "Phase $NEXT_PHASE produced no valid completion evidence (${PHASE_COMPLETION_REASON})"
                append_qa_runtime_update "phase-command-missing-fresh-verification-attempt-${auto_fix_count}" "$LOGFILE" "$PHASE_COMPLETION_REASON"
                append_handoff_update "missing-fresh-verification-evidence" "$LOGFILE" "$PHASE_COMPLETION_REASON"

                if [[ "$AUTONOMOUS_MODE" == "true" && $auto_fix_count -lt $MAX_AUTO_FIX_ATTEMPTS ]]; then
                    log_info "Attempting verification remediation..."
                    echo "## Phase $NEXT_PHASE - Verification Remediation #${auto_fix_count}" >> "$DECISION_LOG"

                    FIX_PROMPT="$(build_phase_prompt "The previous phase attempt exited cleanly, but completion evidence is still missing.

Failure context:
- Log file: $LOGFILE
- Gate reason: $PHASE_COMPLETION_REASON

Remediation steps:
1. Refresh or generate the latest verification/runtime verdict artifact for this phase.
2. If contract-backed verification applies, satisfy evidenceFresh=true and requiredChecks.missing=[].
3. Record the refreshed evidence in QA_REPORT.md.
4. If the phase is still incomplete, update HANDOFF.md.
5. Re-run only the active phase and finish with fresh evidence.
6. Keep SCORECARD.md authoritative: use \`retry\` until the target score is met with no unmet checklist items or blocking defects.")"

                    update_phase_state "$NEXT_PHASE" "in_progress" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "running" "true" "$PHASE_DOC" "$PHASE_SPRINT_CONTRACT" "$PHASE_QA_REPORT" "$PHASE_HANDOFF" "$PHASE_SCORECARD"
                    PHASE_QA_CHECKSUM_BEFORE="$(file_checksum_or_empty "$PHASE_QA_REPORT")"
                    if run_worker_prompt "$LOGFILE" "$FIX_PROMPT" "$START_TIME" "$PHASE_QA_CHECKSUM_BEFORE"; then
                        END_TIME=$(date +%s)
                        DURATION=$((END_TIME - START_TIME))
                        evaluate_phase_completion_gate_with_retry "$START_TIME"
                        if [[ "$PHASE_COMPLETION_ALLOWED" == "true" ]]; then
                            log_success "Phase $NEXT_PHASE completed after verification remediation (${DURATION}s)"
                            append_qa_runtime_update "phase-completed-after-verification-remediation" "$LOGFILE" "$PHASE_COMPLETION_ARTIFACTS"
                            sync_clean_finish_artifacts "$PHASE_COMPLETION_ARTIFACTS"
                            update_phase_state "$NEXT_PHASE" "completed" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "completed" "false" "$PHASE_DOC" "$PHASE_SPRINT_CONTRACT" "$PHASE_QA_REPORT" "$PHASE_HANDOFF" "$PHASE_SCORECARD"
                            write_clean_finish_handoff "$NEXT_PHASE" "$PHASE_TITLE" "$PHASE_DOC"
                            completed=$((completed + 1))
                            echo "- Status: ✅ Completed (after verification remediation)" >> "$DECISION_LOG"
                            echo "- Duration: ${DURATION}s" >> "$DECISION_LOG"
                            echo "" >> "$DECISION_LOG"
                            run_commit_prompt "$LOGFILE" "/commit-moonshot Phase $NEXT_PHASE 완료 (verification remediation). 변경사항을 커밋해주세요."
                            break
                        fi

                        log_error "Phase $NEXT_PHASE still lacks valid completion evidence (${PHASE_COMPLETION_REASON})"
                        append_qa_runtime_update "verification-remediation-incomplete" "$LOGFILE" "$PHASE_COMPLETION_REASON"
                        append_handoff_update "verification-remediation-incomplete" "$LOGFILE" "$PHASE_COMPLETION_REASON"
                    fi

                    continue
                fi

                failed=$((failed + 1))
                update_phase_state "$NEXT_PHASE" "failed" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "failed" "false" "$PHASE_DOC" "$PHASE_SPRINT_CONTRACT" "$PHASE_QA_REPORT" "$PHASE_HANDOFF" "$PHASE_SCORECARD"
                if [[ "$AUTONOMOUS_MODE" == "true" ]]; then
                    echo "- Status: ❌ Failed (missing fresh verification evidence)" >> "$DECISION_LOG"
                    echo "" >> "$DECISION_LOG"
                    if [[ "$ADVANCE_ON_FAILURE" == "true" ]]; then
                        log_warn "Autonomous mode: Moving to next phase without marking completion"
                    else
                        log_error "Autonomous mode: Stopping loop on failed phase (AGENT_LOOP_ADVANCE_ON_FAILURE=false)"
                        break 2
                    fi
                else
                    echo ""
                    log_warn "Continue to next phase? (y/n)"
                    read -r response
                    if [[ "$response" != "y" ]]; then
                        break 2
                    fi
                fi
                break
            fi

            log_success "Phase $NEXT_PHASE completed (${DURATION}s)"
            append_qa_runtime_update "phase-command-succeeded" "$LOGFILE" "$PHASE_COMPLETION_ARTIFACTS"
            sync_clean_finish_artifacts "$PHASE_COMPLETION_ARTIFACTS"
            update_phase_state "$NEXT_PHASE" "completed" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "completed" "false" "$PHASE_DOC" "$PHASE_SPRINT_CONTRACT" "$PHASE_QA_REPORT" "$PHASE_HANDOFF" "$PHASE_SCORECARD"
            write_clean_finish_handoff "$NEXT_PHASE" "$PHASE_TITLE" "$PHASE_DOC"
            completed=$((completed + 1))
            
            # Log decision
            if [[ "$AUTONOMOUS_MODE" == "true" ]]; then
                echo "## Phase $NEXT_PHASE" >> "$DECISION_LOG"
                echo "- Status: ✅ Completed" >> "$DECISION_LOG"
                echo "- Duration: ${DURATION}s" >> "$DECISION_LOG"
                echo "" >> "$DECISION_LOG"
            fi

            # Run commit skill after successful phase when explicitly enabled
            run_commit_prompt "$LOGFILE" "/commit-moonshot Phase $NEXT_PHASE 완료. 해당 페이즈 변경사항을 커밋해주세요."
            break
        else
            exit_code=$?
            
            # Handle timeout with auto-restart
            if [[ $exit_code -eq 124 && "$WATCHDOG_AUTO_RESTART" == "true" ]]; then
                restart_count=$((restart_count + 1))
                log_warn "Phase $NEXT_PHASE timed out. Restarting... (attempt ${restart_count})"
                
                if [[ "$AUTONOMOUS_MODE" == "true" ]]; then
                    echo "## Phase $NEXT_PHASE - Timeout Restart #${restart_count}" >> "$DECISION_LOG"
                fi
                
                if [[ $WATCHDOG_MAX_RESTARTS -gt 0 && $restart_count -ge $WATCHDOG_MAX_RESTARTS ]]; then
                    log_error "Phase $NEXT_PHASE exceeded restart limit"
                    append_qa_runtime_update "timeout-restart-limit-exceeded" "$LOGFILE"
                    append_handoff_update "timeout-restart-limit-exceeded" "$LOGFILE"
                    failed=$((failed + 1))
                    update_phase_state "$NEXT_PHASE" "failed" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "failed" "false" "$PHASE_DOC" "$PHASE_SPRINT_CONTRACT" "$PHASE_QA_REPORT" "$PHASE_HANDOFF" "$PHASE_SCORECARD"
                    
                    if [[ "$AUTONOMOUS_MODE" == "true" ]]; then
                        echo "- Status: ❌ Failed (restart limit exceeded)" >> "$DECISION_LOG"
                        echo "" >> "$DECISION_LOG"
                        if [[ "$ADVANCE_ON_FAILURE" == "true" ]]; then
                            log_warn "Autonomous mode: Moving to next phase"
                        else
                            log_error "Autonomous mode: Stopping loop on failed phase (AGENT_LOOP_ADVANCE_ON_FAILURE=false)"
                            break 2
                        fi
                    else
                        echo ""
                        log_warn "Continue to next phase? (y/n)"
                        read -r response
                        if [[ "$response" != "y" ]]; then
                            break 2
                        fi
                    fi
                    break
                fi
                continue
            fi
            
            # Handle failure with auto-fix attempts
            auto_fix_count=$((auto_fix_count + 1))
            log_error "Phase $NEXT_PHASE failed (attempt ${auto_fix_count}/${MAX_AUTO_FIX_ATTEMPTS})"
            append_qa_runtime_update "phase-command-failed-attempt-${auto_fix_count}" "$LOGFILE"
            
            if [[ "$AUTONOMOUS_MODE" == "true" && $auto_fix_count -lt $MAX_AUTO_FIX_ATTEMPTS ]]; then
                log_info "Attempting auto-fix..."
                
                # Log the fix attempt
                echo "## Phase $NEXT_PHASE - Auto-fix #${auto_fix_count}" >> "$DECISION_LOG"
                
                # Run auto-fix: analyze log and retry
                FIX_PROMPT="$(build_phase_prompt "The previous phase attempt failed.

Failure context:
- Log file: $LOGFILE

Remediation steps:
1. Analyze the failure from the log and current execution artifacts.
2. Fix only the active-phase issue.
3. Update QA_REPORT.md with the failure cause and remediation result.
4. If the phase is still incomplete, update HANDOFF.md with the next action.
5. Re-run the phase work and verification for phase $NEXT_PHASE.
6. Update SCORECARD.md and keep the verdict at \`retry\` unless the phase objectively meets the target score.")"
                
                update_phase_state "$NEXT_PHASE" "in_progress" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "running" "true" "$PHASE_DOC" "$PHASE_SPRINT_CONTRACT" "$PHASE_QA_REPORT" "$PHASE_HANDOFF" "$PHASE_SCORECARD"
                PHASE_QA_CHECKSUM_BEFORE="$(file_checksum_or_empty "$PHASE_QA_REPORT")"
                if run_worker_prompt "$LOGFILE" "$FIX_PROMPT" "$START_TIME" "$PHASE_QA_CHECKSUM_BEFORE"; then
                    
                    END_TIME=$(date +%s)
                    DURATION=$((END_TIME - START_TIME))
                    evaluate_phase_completion_gate_with_retry "$START_TIME"
                    if [[ "$PHASE_COMPLETION_ALLOWED" != "true" ]]; then
                        log_error "Phase $NEXT_PHASE still lacks valid completion evidence (${PHASE_COMPLETION_REASON})"
                        append_qa_runtime_update "auto-fix-succeeded-without-fresh-verification" "$LOGFILE" "$PHASE_COMPLETION_REASON"
                        append_handoff_update "missing-fresh-verification-evidence" "$LOGFILE" "$PHASE_COMPLETION_REASON"
                        continue
                    fi
                    log_success "Phase $NEXT_PHASE completed after auto-fix (${DURATION}s)"
                    append_qa_runtime_update "phase-completed-after-auto-fix" "$LOGFILE" "$PHASE_COMPLETION_ARTIFACTS"
                    sync_clean_finish_artifacts "$PHASE_COMPLETION_ARTIFACTS"
                    update_phase_state "$NEXT_PHASE" "completed" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "completed" "false" "$PHASE_DOC" "$PHASE_SPRINT_CONTRACT" "$PHASE_QA_REPORT" "$PHASE_HANDOFF" "$PHASE_SCORECARD"
                    write_clean_finish_handoff "$NEXT_PHASE" "$PHASE_TITLE" "$PHASE_DOC"
                    completed=$((completed + 1))
                    
                    echo "- Status: ✅ Completed (after auto-fix)" >> "$DECISION_LOG"
                    echo "- Duration: ${DURATION}s" >> "$DECISION_LOG"
                    echo "" >> "$DECISION_LOG"
                    
                    # Commit after fix
                    run_commit_prompt "$LOGFILE" "/commit-moonshot Phase $NEXT_PHASE 완료 (auto-fix). 변경사항을 커밋해주세요."
                    break
                fi
                continue
            fi
            
            # Max attempts reached or not in autonomous mode
            append_handoff_update "phase-failed-max-attempts" "$LOGFILE"
            failed=$((failed + 1))
            update_phase_state "$NEXT_PHASE" "failed" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "failed" "false" "$PHASE_DOC" "$PHASE_SPRINT_CONTRACT" "$PHASE_QA_REPORT" "$PHASE_HANDOFF" "$PHASE_SCORECARD"
            
            if [[ "$AUTONOMOUS_MODE" == "true" ]]; then
                echo "- Status: ❌ Failed (max attempts reached)" >> "$DECISION_LOG"
                echo "" >> "$DECISION_LOG"
                if [[ "$ADVANCE_ON_FAILURE" == "true" ]]; then
                    log_warn "Autonomous mode: Moving to next phase after ${MAX_AUTO_FIX_ATTEMPTS} failed attempts"
                else
                    log_error "Autonomous mode: Stopping loop on failed phase (AGENT_LOOP_ADVANCE_ON_FAILURE=false)"
                    break 2
                fi
            else
                echo ""
                log_warn "Continue to next phase? (y/n)"
                read -r response
                if [[ "$response" != "y" ]]; then
                    break 2
                fi
            fi
            break
        fi
    done
    
    # Delay between phases
    if [[ $DELAY_SECONDS -gt 0 ]]; then
        sleep "$DELAY_SECONDS"
    fi
done

# -----------------------------------------------------------------------------
# Summary Report
# -----------------------------------------------------------------------------

END_TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Agent Loop Completed${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
log_info "Phases completed: $completed"
if [[ $failed -gt 0 ]]; then
    log_error "Phases failed: $failed"
fi
echo ""

# Generate summary report
if [[ "$AUTONOMOUS_MODE" == "true" ]]; then
    cat > "$SUMMARY_REPORT" << EOF
# Agent Loop Summary Report

## Execution Info
- **Plan Directory**: $PLAN_DIR
- **Total Phases**: $TOTAL_PHASES
- **Completed**: $completed
- **Failed**: $failed
- **Completed At**: $END_TIMESTAMP

## Mode
- Autonomous Mode: ✅ Enabled
- Auto-fix Attempts: $MAX_AUTO_FIX_ATTEMPTS
- Watchdog Timeout: ${WATCHDOG_MAX_SECONDS}s
- Advance On Failure: $ADVANCE_ON_FAILURE
- Scorecard Required: $SCORECARD_REQUIRED
- Target Completion Score: $TARGET_COMPLETION_SCORE

## Decision Log
See: $DECISION_LOG

## Logs
See: $LOG_DIR
EOF
    log_info "Summary report: $SUMMARY_REPORT"
    log_info "Decision log: $DECISION_LOG"
fi
