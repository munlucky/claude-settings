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
SINGLE_PHASE_MODE=false
EXPLICIT_PHASE_NUM=""
EXPLICIT_PHASE_TITLE=""
EXPLICIT_PHASE_DOC=""
LOG_DIR=".claude/logs/agent-loop"
DECISION_LOG=".claude/logs/agent-loop/decisions.md"
SUMMARY_REPORT=".claude/logs/agent-loop/summary.md"
WORKFLOW_LOG_DIR=".claude/logs/workflow-enforcement"
WATCHDOG_CHECK_SECONDS=60
WATCHDOG_MAX_SECONDS=$((2 * 60 * 60))
WATCHDOG_AUTO_RESTART=true
WATCHDOG_MAX_RESTARTS=2
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
WATCHDOG_MAX_RESTARTS="${AGENT_LOOP_WATCHDOG_MAX_RESTARTS:-$WATCHDOG_MAX_RESTARTS}"
CODEX_REASONING_EFFORT="${AGENT_LOOP_CODEX_REASONING_EFFORT:-${MOONSHOT_CODEX_REASONING_EFFORT:-medium}}"
TOOL_SCHEMA_ERROR_GUARD="${AGENT_LOOP_TOOL_SCHEMA_ERROR_GUARD:-2}"
ADVANCE_ON_FAILURE="${AGENT_LOOP_ADVANCE_ON_FAILURE:-false}"
SCORECARD_REQUIRED="${AGENT_LOOP_SCORECARD_REQUIRED:-true}"
TARGET_COMPLETION_SCORE="${AGENT_LOOP_TARGET_COMPLETION_SCORE:-100}"
SCORECARD_PROFILE="${AGENT_LOOP_SCORECARD_PROFILE:-auto}"
TIMEOUT_RUNTIME_FALLBACK="${AGENT_LOOP_TIMEOUT_RUNTIME_FALLBACK:-true}"
AGENT_LOOP_STALE_PHASE_SECONDS="${AGENT_LOOP_STALE_PHASE_SECONDS:-1800}"

LOOP_STOPPED_EARLY=false
LOOP_STOP_REASON=""
LOOP_STOP_DETAIL=""
LOOP_STOP_PHASE=""
LOOP_STOP_LOG=""

to_int() {
    local value="${1-0}"
    value="${value//[[:space:]]/}"

    if [[ "$value" =~ ^-?[0-9]+$ ]]; then
        echo "$value"
        return
    fi

    echo 0
}

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

gate_reason_needs_closeout() {
    case "${1:-}" in
        review-incomplete|workflow-review-skill-missing|workflow-review-bundle-missing|finish-closeout-incomplete|workflow-finish-bundle-missing|workflow-evidence-warnings)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

remediation_stage_for_gate_reason() {
    case "${1:-}" in
        review-incomplete|workflow-review-skill-missing|workflow-review-bundle-missing)
            printf 'review'
            ;;
        finish-closeout-incomplete|workflow-finish-bundle-missing|workflow-evidence-warnings)
            printf 'finish/handoff'
            ;;
        *)
            printf 'verify'
            ;;
    esac
}

remediation_status_label() {
    case "$(remediation_stage_for_gate_reason "${1:-}")" in
        review)
            printf 'closeout-remediation-review-started'
            ;;
        finish/handoff)
            printf 'closeout-remediation-finish-started'
            ;;
        *)
            printf 'verification-remediation-started'
            ;;
    esac
}

missing_evidence_runtime_status() {
    local gate_reason="${1:-}"
    local attempt_count="${2:-1}"
    if gate_reason_needs_closeout "$gate_reason"; then
        printf 'phase-command-missing-closeout-evidence-attempt-%s' "$attempt_count"
        return
    fi
    printf 'phase-command-missing-fresh-verification-attempt-%s' "$attempt_count"
}

incomplete_remediation_status() {
    local gate_reason="${1:-}"
    if gate_reason_needs_closeout "$gate_reason"; then
        printf 'closeout-remediation-incomplete'
        return
    fi
    printf 'verification-remediation-incomplete'
}

handoff_stop_reason() {
    local gate_reason="${1:-}"
    if gate_reason_needs_closeout "$gate_reason"; then
        printf 'deferred_verification'
        return
    fi
    printf 'missing-fresh-verification-evidence'
}

record_loop_stop() {
    local phase="$1"
    local reason="$2"
    local detail="$3"
    local log_file="${4:-}"

    LOOP_STOPPED_EARLY=true
    LOOP_STOP_PHASE="$phase"
    LOOP_STOP_REASON="$reason"
    LOOP_STOP_DETAIL="$detail"
    LOOP_STOP_LOG="$log_file"

    echo ""
    echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${RED}  Agent Loop Stopped Early${NC}"
    echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    log_error "Phase ${phase} 중단 사유: ${detail}"
    if [[ -n "$log_file" ]]; then
        log_error "확인할 로그: ${log_file}"
    fi
    echo ""

    if [[ "$AUTONOMOUS_MODE" == "true" ]]; then
        {
            echo "## Phase ${phase} - Stopped Early"
            echo "- Reason: ${reason}"
            echo "- Detail: ${detail}"
            if [[ -n "$log_file" ]]; then
                echo "- Log: ${log_file}"
            fi
            echo ""
        } >> "$DECISION_LOG"
    fi
}

record_runtime_timeout() {
    local phase="$1"
    local log_file="$2"
    local runtime="$3"
    local restart_count="$4"

    local reason
    local detail

    reason="$(classify_timeout_reason "$log_file")"
    detail="$(describe_stop_reason "$reason" "$runtime")"

    append_qa_runtime_update "phase-timeout-attempt-${restart_count}" "$log_file" "$detail"
    append_handoff_update "phase-timeout-attempt-${restart_count}" "$log_file" "$detail"

    TIMEOUT_REASON="$reason"
    TIMEOUT_DETAIL="$detail"
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

source "$SCRIPT_DIR/agent-loop-phase-runtime.sh"
source "$SCRIPT_DIR/agent-loop-phase-plan.sh"
source "$SCRIPT_DIR/agent-loop-phase-artifacts.sh"
source "$SCRIPT_DIR/agent-loop-phase-state.sh"
source "$SCRIPT_DIR/agent-loop-phase-attempt.sh"

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
        --single-phase)
            SINGLE_PHASE_MODE=true
            shift
            ;;
        --phase-num)
            EXPLICIT_PHASE_NUM="$2"
            shift 2
            ;;
        --phase-title)
            EXPLICIT_PHASE_TITLE="$2"
            shift 2
            ;;
        --phase-doc)
            EXPLICIT_PHASE_DOC="$2"
            shift 2
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

RUNNER_RUNTIME="$(resolve_runner_runtime)"

mkdir -p "$LOG_DIR"

if [[ "$AUTONOMOUS_MODE" == "true" && ( "$SINGLE_PHASE_MODE" != "true" || ! -f "$DECISION_LOG" ) ]]; then
    echo "# Autonomous Decision Log" > "$DECISION_LOG"
    echo "" >> "$DECISION_LOG"
    echo "Generated: $(date '+%Y-%m-%d %H:%M:%S')" >> "$DECISION_LOG"
    echo "" >> "$DECISION_LOG"
fi

TOTAL_PHASES=$(count_total_phases)
if [[ "$SINGLE_PHASE_MODE" != "true" ]]; then
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
    log_info "Total phases: $TOTAL_PHASES"
    echo ""
fi

completed=0
failed=0

while true; do
    STALE_PHASES="$(list_stale_in_progress_phases "$AGENT_LOOP_STALE_PHASE_SECONDS")"
    if [[ -n "$STALE_PHASES" ]]; then
        log_warn "Stale in-progress phases detected, forcing failed state before reroute: ${STALE_PHASES//$'\n'/, }"
        while IFS= read -r stale_phase_num; do
            [[ -z "$stale_phase_num" ]] && continue
            update_phase_state "$stale_phase_num" "failed" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "stale-running-timeout" "false"
            if [[ -n "$DECISION_LOG" ]]; then
                {
                    echo "## Phase ${stale_phase_num} - Stale In-Progress Guard"
                    echo "- Reason: skipped stale in-progress state for > ${AGENT_LOOP_STALE_PHASE_SECONDS}s"
                    echo ""
                } >> "$DECISION_LOG"
            fi
        done <<< "$STALE_PHASES"
    fi

    if [[ -n "$EXPLICIT_PHASE_NUM" ]]; then
        NEXT_PHASE="$EXPLICIT_PHASE_NUM"
    else
        NEXT_PHASE=$(get_next_phase)
    fi

    if [[ -z "$NEXT_PHASE" || "$NEXT_PHASE" == "" ]]; then
        break
    fi

    if (( $(to_int "$MAX_PHASES") > 0 && $(to_int "$completed") >= $(to_int "$MAX_PHASES") )); then
        log_info "Reached max phases limit ($MAX_PHASES)"
        break
    fi

    if [[ -n "$EXPLICIT_PHASE_TITLE" ]]; then
        PHASE_TITLE="$EXPLICIT_PHASE_TITLE"
    else
        PHASE_TITLE=$(get_phase_title "$NEXT_PHASE")
    fi
    if [[ -n "$EXPLICIT_PHASE_DOC" ]]; then
        PHASE_DOC="$EXPLICIT_PHASE_DOC"
    else
        PHASE_DOC=$(get_phase_doc "$NEXT_PHASE")
    fi
    TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
    LOGFILE="${LOG_DIR}/phase-${NEXT_PHASE}_${TIMESTAMP}.log"
    assign_execution_artifact_paths "$NEXT_PHASE" "$PHASE_TITLE"

    echo -e "${CYAN}───────────────────────────────────────────────────────────────${NC}"
    log_phase "Phase $NEXT_PHASE: $PHASE_TITLE"
    log_info "Sprint contract: $PHASE_SPRINT_CONTRACT"
    log_info "QA report: $PHASE_QA_REPORT"
    log_info "Handoff: $PHASE_HANDOFF"
    log_info "Scorecard: $PHASE_SCORECARD"

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

    PRIMARY_PHASE_PROMPT_INSTRUCTIONS="Implement phase $NEXT_PHASE using the active phase doc as the only planning baseline.

Primary objective:
- Complete the scoped work for phase $NEXT_PHASE.
- Keep changes bounded to the active phase.
- Do not move to other phases in this run.
- If the phase artifacts declare an exact verification command, run that command exactly once instead of searching for alternative verifiers.
- Do not stop at implementation-complete or verification-complete checkpoints alone.
- Return control only after fresh-or-still-valid verification evidence exists, review evidence is recorded, finish-closeout fields are concrete, and SCORECARD.md says \`Verdict: done\`."
    PHASE_PROMPT="$(build_phase_prompt "$PRIMARY_PHASE_PROMPT_INSTRUCTIONS")"
    START_TIME=$(date +%s)
    restart_count=0
    auto_fix_count=0
    timeout_fallback_used=false

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

    mkdir -p "$EXECUTION_ROOT"
    ensure_execution_artifacts "$NEXT_PHASE" "$PHASE_TITLE" "$PHASE_DOC"
    log_info "Sprint contract: $PHASE_SPRINT_CONTRACT"
    log_info "QA report: $PHASE_QA_REPORT"
    log_info "Handoff: $PHASE_HANDOFF"
    log_info "Scorecard: $PHASE_SCORECARD"

    while true; do
        update_phase_state "$NEXT_PHASE" "in_progress" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "running" "true" "$PHASE_DOC" "$PHASE_SPRINT_CONTRACT" "$PHASE_QA_REPORT" "$PHASE_HANDOFF" "$PHASE_SCORECARD"
        record_phase_progress_checkpoint "ready/isolate" "phase-attempt-started" "$LOGFILE" "Phase state moved to in_progress before the worker prompt."
        PHASE_QA_CHECKSUM_BEFORE="$(file_checksum_or_empty "$PHASE_QA_REPORT")"
        if run_worker_prompt "$LOGFILE" "$PHASE_PROMPT" "$START_TIME" "$PHASE_QA_CHECKSUM_BEFORE"; then
            END_TIME=$(date +%s)
            DURATION=$((END_TIME - START_TIME))
            evaluate_phase_completion_gate_with_retry "$START_TIME"

            if [[ "$PHASE_COMPLETION_ALLOWED" != "true" ]]; then
                auto_fix_count=$((auto_fix_count + 1))
                log_error "Phase $NEXT_PHASE produced no valid completion evidence (${PHASE_COMPLETION_REASON})"
                append_qa_runtime_update "$(missing_evidence_runtime_status "$PHASE_COMPLETION_REASON" "$auto_fix_count")" "$LOGFILE" "$PHASE_COMPLETION_REASON"
                append_handoff_update "$(handoff_stop_reason "$PHASE_COMPLETION_REASON")" "$LOGFILE" "$PHASE_COMPLETION_REASON"

                final_stop_reason="missing-verification-evidence"
                if detect_tool_schema_error_loop "$LOGFILE"; then
                    final_stop_reason="tool-schema-error-loop"
                fi
                if detect_verification_command_missing "$LOGFILE"; then
                    final_stop_reason="verification-command-missing"
                fi

                eval "$(decide_missing_evidence_action \
                    "$auto_fix_count" \
                    "$MAX_AUTO_FIX_ATTEMPTS" \
                    "$AUTONOMOUS_MODE" \
                    "$ADVANCE_ON_FAILURE" \
                    "$final_stop_reason")"

                if [[ "$ACTION" == "stop-loop" ]]; then
                    failed=$((failed + 1))
                    update_phase_state "$NEXT_PHASE" "failed" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "failed" "false" "$PHASE_DOC" "$PHASE_SPRINT_CONTRACT" "$PHASE_QA_REPORT" "$PHASE_HANDOFF" "$PHASE_SCORECARD"
                    if [[ "$final_stop_reason" == "tool-schema-error-loop" ]]; then
                        echo "- Status: ❌ Failed (tool schema error loop)" >> "$DECISION_LOG"
                        echo "- Detail: $(describe_stop_reason "$final_stop_reason" "$RUNNER_RUNTIME")" >> "$DECISION_LOG"
                    elif [[ "$final_stop_reason" == "verification-command-missing" ]]; then
                        echo "- Status: ❌ Failed (verification command missing)" >> "$DECISION_LOG"
                    else
                        echo "- Status: ❌ Failed (missing fresh verification evidence)" >> "$DECISION_LOG"
                    fi
                    echo "" >> "$DECISION_LOG"
                    record_loop_stop "$NEXT_PHASE" "$final_stop_reason" "$(describe_stop_reason "$final_stop_reason" "$RUNNER_RUNTIME" "$PHASE_COMPLETION_REASON")" "$LOGFILE"
                    break 2
                fi

                if [[ "$ACTION" == "verification-remediation" ]]; then
                    remediation_stage="$(remediation_stage_for_gate_reason "$PHASE_COMPLETION_REASON")"
                    remediation_label="Verification Remediation"
                    if [[ "$remediation_stage" != "verify" ]]; then
                        remediation_label="Closeout Remediation"
                    fi
                    log_info "Attempting ${remediation_label,,}..."
                    echo "## Phase $NEXT_PHASE - ${remediation_label} #${auto_fix_count}" >> "$DECISION_LOG"

                    FIX_PROMPT="$(build_phase_prompt "$(build_verification_remediation_prompt "$NEXT_PHASE" "$LOGFILE" "$PHASE_COMPLETION_REASON")")"

                    update_phase_state "$NEXT_PHASE" "in_progress" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "running" "true" "$PHASE_DOC" "$PHASE_SPRINT_CONTRACT" "$PHASE_QA_REPORT" "$PHASE_HANDOFF" "$PHASE_SCORECARD"
                    record_phase_progress_checkpoint "$remediation_stage" "$(remediation_status_label "$PHASE_COMPLETION_REASON")" "$LOGFILE" "$PHASE_COMPLETION_REASON"
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
                        append_qa_runtime_update "$(incomplete_remediation_status "$PHASE_COMPLETION_REASON")" "$LOGFILE" "$PHASE_COMPLETION_REASON"
                        append_handoff_update "$(handoff_stop_reason "$PHASE_COMPLETION_REASON")" "$LOGFILE" "$PHASE_COMPLETION_REASON"
                    fi

                    continue
                fi

                failed=$((failed + 1))
                update_phase_state "$NEXT_PHASE" "failed" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "failed" "false" "$PHASE_DOC" "$PHASE_SPRINT_CONTRACT" "$PHASE_QA_REPORT" "$PHASE_HANDOFF" "$PHASE_SCORECARD"
                if [[ "$AUTONOMOUS_MODE" == "true" ]]; then
                    echo "- Status: ❌ Failed (missing fresh verification evidence)" >> "$DECISION_LOG"
                    echo "" >> "$DECISION_LOG"
                    if [[ "$ACTION" == "advance-after-failure" ]]; then
                        log_warn "Autonomous mode: Moving to next phase without marking completion"
                    else
                        record_loop_stop "$NEXT_PHASE" "$final_stop_reason" "$(describe_stop_reason "$final_stop_reason" "$RUNNER_RUNTIME" "$PHASE_COMPLETION_REASON")" "$LOGFILE"
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

            if [[ "$AUTONOMOUS_MODE" == "true" ]]; then
                echo "## Phase $NEXT_PHASE" >> "$DECISION_LOG"
                echo "- Status: ✅ Completed" >> "$DECISION_LOG"
                echo "- Duration: ${DURATION}s" >> "$DECISION_LOG"
                echo "" >> "$DECISION_LOG"
            fi

            run_commit_prompt "$LOGFILE" "/commit-moonshot Phase $NEXT_PHASE 완료. 해당 페이즈 변경사항을 커밋해주세요."
            break
        else
            exit_code=$?

            if [[ $exit_code -eq 124 && "$WATCHDOG_AUTO_RESTART" == "true" ]]; then
                restart_count=$((restart_count + 1))
                record_runtime_timeout "$NEXT_PHASE" "$LOGFILE" "$RUNNER_RUNTIME" "$restart_count"
                log_warn "Phase $NEXT_PHASE timed out. Restarting... (attempt ${restart_count})"

                if [[ "$AUTONOMOUS_MODE" == "true" ]]; then
                    echo "## Phase $NEXT_PHASE - Timeout Restart #${restart_count}" >> "$DECISION_LOG"
                    echo "- Runtime: ${RUNNER_RUNTIME}" >> "$DECISION_LOG"
                    echo "- Detail: ${TIMEOUT_DETAIL}" >> "$DECISION_LOG"
                    echo "" >> "$DECISION_LOG"
                fi

                fallback_runtime="$(resolve_timeout_fallback_runtime "$RUNNER_RUNTIME")"
                eval "$(decide_timeout_action \
                    "$restart_count" \
                    "$WATCHDOG_MAX_RESTARTS" \
                    "$TIMEOUT_RUNTIME_FALLBACK" \
                    "$timeout_fallback_used" \
                    "$fallback_runtime" \
                    "$RUNNER_RUNTIME" \
                    "$AUTONOMOUS_MODE" \
                    "$ADVANCE_ON_FAILURE")"

                if [[ "$ACTION" == "switch-runtime" ]]; then
                    previous_runtime="$RUNNER_RUNTIME"
                    RUNNER_RUNTIME="$FALLBACK_RUNTIME"
                    timeout_fallback_used=true
                    PHASE_PROMPT="$(build_phase_prompt "$PRIMARY_PHASE_PROMPT_INSTRUCTIONS")"
                    fallback_detail="${TIMEOUT_DETAIL}. 동일 phase를 ${previous_runtime}에서 ${FALLBACK_RUNTIME}로 전환해 1회 더 시도합니다."
                    log_warn "Timeout fallback: switching runtime from ${previous_runtime} to ${FALLBACK_RUNTIME}"
                    append_qa_runtime_update "timeout-runtime-fallback" "$LOGFILE" "$fallback_detail"
                    append_handoff_update "timeout-runtime-fallback" "$LOGFILE" "$fallback_detail"
                    continue
                fi

                if [[ "$ACTION" == "stop-loop" || "$ACTION" == "advance-after-failure" ]]; then
                    stop_detail="$(describe_stop_reason "timeout-restart-limit" "$RUNNER_RUNTIME" "$TIMEOUT_DETAIL")"
                    log_error "Phase $NEXT_PHASE exceeded restart limit"
                    append_qa_runtime_update "timeout-restart-limit-exceeded" "$LOGFILE" "$stop_detail"
                    append_handoff_update "timeout-restart-limit-exceeded" "$LOGFILE" "$stop_detail"
                    failed=$((failed + 1))
                    update_phase_state "$NEXT_PHASE" "failed" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "failed" "false" "$PHASE_DOC" "$PHASE_SPRINT_CONTRACT" "$PHASE_QA_REPORT" "$PHASE_HANDOFF" "$PHASE_SCORECARD"

                    if [[ "$AUTONOMOUS_MODE" == "true" ]]; then
                        echo "- Status: ❌ Failed (restart limit exceeded)" >> "$DECISION_LOG"
                        echo "- Detail: ${stop_detail}" >> "$DECISION_LOG"
                        echo "" >> "$DECISION_LOG"
                        if [[ "$ACTION" == "advance-after-failure" ]]; then
                            log_warn "Autonomous mode: Moving to next phase"
                        else
                            record_loop_stop "$NEXT_PHASE" "timeout-restart-limit" "$stop_detail" "$LOGFILE"
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

            auto_fix_count=$((auto_fix_count + 1))
            log_error "Phase $NEXT_PHASE failed (attempt ${auto_fix_count}/${MAX_AUTO_FIX_ATTEMPTS})"
            append_qa_runtime_update "phase-command-failed-attempt-${auto_fix_count}" "$LOGFILE"

            final_stop_reason="phase-failed"
            if detect_tool_schema_error_loop "$LOGFILE"; then
                final_stop_reason="tool-schema-error-loop"
            fi
            if detect_verification_command_missing "$LOGFILE"; then
                final_stop_reason="verification-command-missing"
            fi

            eval "$(decide_failure_action \
                "$auto_fix_count" \
                "$MAX_AUTO_FIX_ATTEMPTS" \
                "$AUTONOMOUS_MODE" \
                "$ADVANCE_ON_FAILURE" \
                "$final_stop_reason")"

            if [[ "$ACTION" == "stop-loop" && "$final_stop_reason" == "tool-schema-error-loop" ]]; then
                failed=$((failed + 1))
                append_handoff_update "tool-schema-error-loop" "$LOGFILE" "$(describe_stop_reason "$final_stop_reason" "$RUNNER_RUNTIME")"
                echo "- Status: ❌ Failed (tool schema error loop)" >> "$DECISION_LOG"
                echo "- Detail: $(describe_stop_reason "$final_stop_reason" "$RUNNER_RUNTIME")" >> "$DECISION_LOG"
                echo "" >> "$DECISION_LOG"
                update_phase_state "$NEXT_PHASE" "failed" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "failed" "false" "$PHASE_DOC" "$PHASE_SPRINT_CONTRACT" "$PHASE_QA_REPORT" "$PHASE_HANDOFF" "$PHASE_SCORECARD"
                record_loop_stop "$NEXT_PHASE" "$final_stop_reason" "$(describe_stop_reason "$final_stop_reason" "$RUNNER_RUNTIME" "$PHASE_COMPLETION_REASON")" "$LOGFILE"
                break 2
            fi

            if [[ "$ACTION" == "stop-loop" && "$final_stop_reason" == "verification-command-missing" ]]; then
                failed=$((failed + 1))
                update_phase_state "$NEXT_PHASE" "failed" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "failed" "false" "$PHASE_DOC" "$PHASE_SPRINT_CONTRACT" "$PHASE_QA_REPORT" "$PHASE_HANDOFF" "$PHASE_SCORECARD"
                echo "- Status: ❌ Failed (verification command missing)" >> "$DECISION_LOG"
                echo "" >> "$DECISION_LOG"
                record_loop_stop "$NEXT_PHASE" "$final_stop_reason" "$(describe_stop_reason "$final_stop_reason" "$RUNNER_RUNTIME" "$PHASE_COMPLETION_REASON")" "$LOGFILE"
                break 2
            fi

            if [[ "$ACTION" == "auto-fix" ]]; then
                log_info "Attempting auto-fix..."
                echo "## Phase $NEXT_PHASE - Auto-fix #${auto_fix_count}" >> "$DECISION_LOG"

                FIX_PROMPT="$(build_phase_prompt "$(build_auto_fix_prompt "$NEXT_PHASE" "$LOGFILE")")"

                update_phase_state "$NEXT_PHASE" "in_progress" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "running" "true" "$PHASE_DOC" "$PHASE_SPRINT_CONTRACT" "$PHASE_QA_REPORT" "$PHASE_HANDOFF" "$PHASE_SCORECARD"
                record_phase_progress_checkpoint "execute" "auto-fix-started" "$LOGFILE" "Retrying the active phase after a failed attempt."
                PHASE_QA_CHECKSUM_BEFORE="$(file_checksum_or_empty "$PHASE_QA_REPORT")"
                if run_worker_prompt "$LOGFILE" "$FIX_PROMPT" "$START_TIME" "$PHASE_QA_CHECKSUM_BEFORE"; then
                    END_TIME=$(date +%s)
                    DURATION=$((END_TIME - START_TIME))
                    evaluate_phase_completion_gate_with_retry "$START_TIME"
                    if [[ "$PHASE_COMPLETION_ALLOWED" != "true" ]]; then
                        log_error "Phase $NEXT_PHASE still lacks valid completion evidence (${PHASE_COMPLETION_REASON})"
                        append_qa_runtime_update "auto-fix-succeeded-without-fresh-verification" "$LOGFILE" "$PHASE_COMPLETION_REASON"
                        append_handoff_update "$(handoff_stop_reason "$PHASE_COMPLETION_REASON")" "$LOGFILE" "$PHASE_COMPLETION_REASON"
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

                    run_commit_prompt "$LOGFILE" "/commit-moonshot Phase $NEXT_PHASE 완료 (auto-fix). 변경사항을 커밋해주세요."
                    break
                fi
                continue
            fi

            append_handoff_update "phase-failed-max-attempts" "$LOGFILE"
            failed=$((failed + 1))
            update_phase_state "$NEXT_PHASE" "failed" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "failed" "false" "$PHASE_DOC" "$PHASE_SPRINT_CONTRACT" "$PHASE_QA_REPORT" "$PHASE_HANDOFF" "$PHASE_SCORECARD"

            if [[ "$AUTONOMOUS_MODE" == "true" ]]; then
                echo "- Status: ❌ Failed (max attempts reached)" >> "$DECISION_LOG"
                echo "" >> "$DECISION_LOG"
                if [[ "$ACTION" == "advance-after-failure" ]]; then
                    log_warn "Autonomous mode: Moving to next phase after ${MAX_AUTO_FIX_ATTEMPTS} failed attempts"
                else
                    record_loop_stop "$NEXT_PHASE" "phase-max-attempts" "$(describe_stop_reason "phase-max-attempts" "$RUNNER_RUNTIME")" "$LOGFILE"
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

    if [[ "$SINGLE_PHASE_MODE" == "true" ]]; then
        break
    fi

    if (( $(to_int "$DELAY_SECONDS") > 0 )); then
        sleep "$DELAY_SECONDS"
    fi
done

END_TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

if [[ "$SINGLE_PHASE_MODE" != "true" ]]; then
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  Agent Loop Completed${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    log_info "Phases completed: $completed"
    if (( $(to_int "$failed") > 0 )); then
        log_error "Phases failed: $failed"
    fi
    echo ""
fi

if [[ "$AUTONOMOUS_MODE" == "true" && "$SINGLE_PHASE_MODE" != "true" ]]; then
    cat > "$SUMMARY_REPORT" <<EOF
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
- Watchdog Max Restarts: ${WATCHDOG_MAX_RESTARTS}
- Advance On Failure: $ADVANCE_ON_FAILURE
- Scorecard Required: $SCORECARD_REQUIRED
- Target Completion Score: $TARGET_COMPLETION_SCORE

## Loop Stop
- Stopped Early: $LOOP_STOPPED_EARLY
- Phase: ${LOOP_STOP_PHASE:-n/a}
- Reason: ${LOOP_STOP_REASON:-n/a}
- Detail: ${LOOP_STOP_DETAIL:-n/a}
- Log: ${LOOP_STOP_LOG:-n/a}

## Decision Log
See: $DECISION_LOG

## Logs
See: $LOG_DIR
EOF
    log_info "Summary report: $SUMMARY_REPORT"
    log_info "Decision log: $DECISION_LOG"
fi
