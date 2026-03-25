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
WATCHDOG_CHECK_SECONDS=60
WATCHDOG_MAX_SECONDS=$((2 * 60 * 60))
WATCHDOG_AUTO_RESTART=true
# 0 = unlimited restarts
WATCHDOG_MAX_RESTARTS=0

# Autonomous Mode (default: true)
# When enabled, Claude will make autonomous decisions without user confirmation
AUTONOMOUS_MODE=true
# Max auto-fix attempts before moving to next phase
MAX_AUTO_FIX_ATTEMPTS=3

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

    case "$RUNNER_RUNTIME" in
        claude)
            run_with_watchdog "$log_file" claude --dangerously-skip-permissions -p "$prompt"
            ;;
        codex)
            run_with_watchdog "$log_file" codex exec --full-auto -C "$PWD" "$prompt"
            ;;
        *)
            log_error "Unsupported runtime: $RUNNER_RUNTIME"
            return 1
            ;;
    esac
}

run_commit_prompt() {
    local log_file="$1"
    local prompt="$2"

    case "$RUNNER_RUNTIME" in
        claude)
            run_with_watchdog "$log_file" claude --dangerously-skip-permissions -c -p "$prompt" || true
            ;;
        codex)
            run_with_watchdog "$log_file" codex exec --full-auto -C "$PWD" "$prompt" || true
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
        # Find first non-completed phase
        awk '
            $1=="-" && $2=="number:" {n=$3}
            $1=="status:" && ($2=="pending" || $2=="in_progress") {print n; exit}
        ' "$STATUS_FILE"
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

ensure_execution_artifacts() {
    local phase_num="$1"
    local phase_title="$2"
    local phase_doc="$3"
    local phase_prefix
    local phase_slug

    printf -v phase_prefix '%02d' "$phase_num"
    phase_slug=$(sanitize_slug "$phase_title")
    if [[ -z "$phase_slug" ]]; then
        phase_slug="phase-${phase_prefix}"
    fi

    PHASE_EXECUTION_DIR="${EXECUTION_ROOT}/${phase_prefix}-${phase_slug}"
    PHASE_SPRINT_CONTRACT="${PHASE_EXECUTION_DIR}/SPRINT_CONTRACT.md"
    PHASE_QA_REPORT="${PHASE_EXECUTION_DIR}/QA_REPORT.md"
    PHASE_HANDOFF="${PHASE_EXECUTION_DIR}/HANDOFF.md"

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

## Planned Changes
- Files/modules:
- Interfaces/contracts:

## Done Checks
| Check | Type | Pass Condition |
|-------|------|----------------|
|  | UI/API/Test |  |

## Evaluator Focus
- Core flow:
- Edge cases:
- Stub-only behavior to reject:

## Evidence
- Commands:
- Runtime flow:
- Artifacts:

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
EOF
    fi

    if [[ ! -f "$PHASE_HANDOFF" ]]; then
        cat > "$PHASE_HANDOFF" <<EOF
# Phase ${phase_prefix} Handoff

> Update when the phase stops without clean completion.

## Goal
- ${phase_title}

## Current State
- Completed:
- In progress:
- Blocked:

## Next Steps
1. Review ${PHASE_SPRINT_CONTRACT}
2. Continue implementation or remediation
3. Re-run verification and update ${PHASE_QA_REPORT}

## Evidence Paths
- Sprint contract: ${PHASE_SPRINT_CONTRACT}
- QA report: ${PHASE_QA_REPORT}
- Phase doc: ${phase_doc}
EOF
    fi
}

append_qa_runtime_update() {
    local status="$1"
    local log_file="$2"
    {
        echo ""
        echo "### $(date '+%Y-%m-%d %H:%M:%S')"
        echo "- Runtime status: ${status}"
        echo "- Log: ${log_file}"
    } >> "$PHASE_QA_REPORT"
}

append_handoff_update() {
    local reason="$1"
    local log_file="$2"
    {
        echo ""
        echo "## Runtime Update ($(date '+%Y-%m-%d %H:%M:%S'))"
        echo "- Reason: ${reason}"
        echo "- Log: ${log_file}"
        echo "- Next action: review \`${PHASE_SPRINT_CONTRACT}\`, update \`${PHASE_QA_REPORT}\`, then resume implementation."
    } >> "$PHASE_HANDOFF"
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
        return 124
    fi
    return "$exit_code"
}

# Update phase status in phase-status.yaml (best-effort)
update_phase_status() {
    local phase_num="$1"
    local new_status="$2"
    local timestamp="$3"

    if [[ ! -f "$STATUS_FILE" ]]; then
        return
    fi

    local tmp_file="${STATUS_FILE}.tmp"
    awk -v num="$phase_num" -v status="$new_status" -v ts="$timestamp" '
        $1=="-" && $2=="number:" {
            if (in_block && status=="completed" && !has_completedAt && ts!="") {
                print "    completedAt: \"" ts "\""
            }
            in_block = ($3==num)
            has_completedAt=0
        }
        in_block && $1=="status:" { print "    status: " status; next }
        in_block && $1=="completedAt:" {
            has_completedAt=1
            if (status=="completed" && ts!="") {
                print "    completedAt: \"" ts "\""
            } else {
                print
            }
            next
        }
        { print }
        END {
            if (in_block && status=="completed" && !has_completedAt && ts!="") {
                print "    completedAt: \"" ts "\""
            }
        }
    ' "$STATUS_FILE" > "$tmp_file" && mv "$tmp_file" "$STATUS_FILE"
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
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_warn "[DRY-RUN] Would execute phase $NEXT_PHASE"
        completed=$((completed + 1))
        sleep 1
        continue
    fi
    
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
    
    PHASE_PROMPT="/moonshot-orchestrator Phase $NEXT_PHASE 를 구현해주세요.
계획 문서: $PLAN_DIR
활성 phase 문서: $PHASE_DOC
실행 아티팩트:
- SPRINT_CONTRACT: $PHASE_SPRINT_CONTRACT
- QA_REPORT: $PHASE_QA_REPORT
- HANDOFF: $PHASE_HANDOFF

작업 규칙:
- 코드 수정 전에 반드시 SPRINT_CONTRACT.md를 현재 phase 기준으로 보강하세요.
- 검증이 실행되면 QA_REPORT.md를 갱신하세요.
- 완료되지 않은 상태로 멈추면 HANDOFF.md를 갱신하세요.

$AUTONOMOUS_INSTRUCTIONS"
    
    # Execute worker session
    START_TIME=$(date +%s)
    restart_count=0
    auto_fix_count=0
    
    while true; do
        if run_worker_prompt "$LOGFILE" "$PHASE_PROMPT"; then
            
            END_TIME=$(date +%s)
            DURATION=$((END_TIME - START_TIME))
            log_success "Phase $NEXT_PHASE completed (${DURATION}s)"
            append_qa_runtime_update "phase-command-succeeded" "$LOGFILE"
            update_phase_status "$NEXT_PHASE" "completed" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
            completed=$((completed + 1))
            
            # Log decision
            if [[ "$AUTONOMOUS_MODE" == "true" ]]; then
                echo "## Phase $NEXT_PHASE" >> "$DECISION_LOG"
                echo "- Status: ✅ Completed" >> "$DECISION_LOG"
                echo "- Duration: ${DURATION}s" >> "$DECISION_LOG"
                echo "" >> "$DECISION_LOG"
            fi

            # Run commit skill after successful phase
            log_info "Running commit-moonshot for Phase $NEXT_PHASE"
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
                    
                    if [[ "$AUTONOMOUS_MODE" == "true" ]]; then
                        echo "- Status: ❌ Failed (restart limit exceeded)" >> "$DECISION_LOG"
                        echo "" >> "$DECISION_LOG"
                        log_warn "Autonomous mode: Moving to next phase"
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
                FIX_PROMPT="이전 Phase $NEXT_PHASE 실행이 실패했습니다.
로그 파일: $LOGFILE
활성 phase 문서: $PHASE_DOC
실행 아티팩트:
- SPRINT_CONTRACT: $PHASE_SPRINT_CONTRACT
- QA_REPORT: $PHASE_QA_REPORT
- HANDOFF: $PHASE_HANDOFF

1. 로그를 분석하여 실패 원인을 파악하세요
2. 문제를 수정하세요
3. QA_REPORT.md에 실패 원인과 수정 결과를 반영하세요
4. 완료되지 않으면 HANDOFF.md를 갱신하세요
5. Phase $NEXT_PHASE 를 다시 완료하세요

$AUTONOMOUS_INSTRUCTIONS"
                
                if run_worker_prompt "$LOGFILE" "$FIX_PROMPT"; then
                    
                    END_TIME=$(date +%s)
                    DURATION=$((END_TIME - START_TIME))
                    log_success "Phase $NEXT_PHASE completed after auto-fix (${DURATION}s)"
                    append_qa_runtime_update "phase-completed-after-auto-fix" "$LOGFILE"
                    update_phase_status "$NEXT_PHASE" "completed" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
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
            
            if [[ "$AUTONOMOUS_MODE" == "true" ]]; then
                echo "- Status: ❌ Failed (max attempts reached)" >> "$DECISION_LOG"
                echo "" >> "$DECISION_LOG"
                log_warn "Autonomous mode: Moving to next phase after ${MAX_AUTO_FIX_ATTEMPTS} failed attempts"
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

## Decision Log
See: $DECISION_LOG

## Logs
See: $LOG_DIR
EOF
    log_info "Summary report: $SUMMARY_REPORT"
    log_info "Decision log: $DECISION_LOG"
fi
