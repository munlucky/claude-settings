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

source "$SCRIPT_DIR/agent-loop-phase-runtime.sh"
source "$SCRIPT_DIR/agent-loop-phase-plan.sh"
source "$SCRIPT_DIR/agent-loop-phase-artifacts.sh"
source "$SCRIPT_DIR/agent-loop-phase-state.sh"

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
mkdir -p "$EXECUTION_ROOT"

if [[ "$AUTONOMOUS_MODE" == "true" ]]; then
    echo "# Autonomous Decision Log" > "$DECISION_LOG"
    echo "" >> "$DECISION_LOG"
    echo "Generated: $(date '+%Y-%m-%d %H:%M:%S')" >> "$DECISION_LOG"
    echo "" >> "$DECISION_LOG"
fi

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

    if [[ -z "$NEXT_PHASE" || "$NEXT_PHASE" == "" ]]; then
        break
    fi

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

            auto_fix_count=$((auto_fix_count + 1))
            log_error "Phase $NEXT_PHASE failed (attempt ${auto_fix_count}/${MAX_AUTO_FIX_ATTEMPTS})"
            append_qa_runtime_update "phase-command-failed-attempt-${auto_fix_count}" "$LOGFILE"

            if [[ "$AUTONOMOUS_MODE" == "true" && $auto_fix_count -lt $MAX_AUTO_FIX_ATTEMPTS ]]; then
                log_info "Attempting auto-fix..."
                echo "## Phase $NEXT_PHASE - Auto-fix #${auto_fix_count}" >> "$DECISION_LOG"

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

    if [[ $DELAY_SECONDS -gt 0 ]]; then
        sleep "$DELAY_SECONDS"
    fi
done

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

if [[ "$AUTONOMOUS_MODE" == "true" ]]; then
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
