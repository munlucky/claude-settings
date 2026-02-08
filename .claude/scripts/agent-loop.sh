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
MAX_PHASES=0
DELAY_SECONDS=3
DRY_RUN=false
LOG_DIR=".claude/logs/agent-loop"
WATCHDOG_CHECK_SECONDS=60
WATCHDOG_MAX_SECONDS=$((2 * 60 * 60))
WATCHDOG_AUTO_RESTART=true
# 0 = unlimited restarts
WATCHDOG_MAX_RESTARTS=0

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
    head -20 "$0" | tail -15
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

MASTER_PLAN=$(find "$PLAN_DIR" -name "*master*" -o -name "*00-*" 2>/dev/null | head -1)
if [[ -z "$MASTER_PLAN" ]]; then
    log_error "Master plan not found in: $PLAN_DIR"
    exit 1
fi

if ! command -v claude &> /dev/null; then
    log_error "Claude CLI not found"
    exit 1
fi

# Create log directory
mkdir -p "$LOG_DIR"

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
    local phase_doc=$(find "$PLAN_DIR" -maxdepth 1 \( -name "${phase_prefix}-*.md" -o -name "*phase*${phase_num}*" \) 2>/dev/null | head -1)
    if [[ -n "$phase_doc" ]]; then
        head -5 "$phase_doc" | grep -E "^#" | head -1 | sed 's/^#* //'
    else
        echo "Phase $phase_num"
    fi
}

count_total_phases() {
    find "$PLAN_DIR" -maxdepth 1 -name "*.md" ! -name "*master*" ! -name "*00-*" 2>/dev/null | wc -l | tr -d ' '
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
    TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
    LOGFILE="${LOG_DIR}/phase-${NEXT_PHASE}_${TIMESTAMP}.log"
    
    echo -e "${CYAN}───────────────────────────────────────────────────────────────${NC}"
    log_phase "Phase $NEXT_PHASE: $PHASE_TITLE"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_warn "[DRY-RUN] Would execute phase $NEXT_PHASE"
        completed=$((completed + 1))
        sleep 1
        continue
    fi
    
    # Execute worker session
    START_TIME=$(date +%s)
    restart_count=0
    while true; do
        if run_with_watchdog "$LOGFILE" claude --dangerously-skip-permissions \
            -p "/moonshot-orchestrator Phase $NEXT_PHASE 를 구현해주세요. 계획 문서: $PLAN_DIR"; then
            
            END_TIME=$(date +%s)
            DURATION=$((END_TIME - START_TIME))
            log_success "Phase $NEXT_PHASE completed (${DURATION}s)"
            update_phase_status "$NEXT_PHASE" "completed" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
            completed=$((completed + 1))

            # Run commit skill after successful phase
            log_info "Running commit-moonshot for Phase $NEXT_PHASE"
            if ! run_with_watchdog "$LOGFILE" claude --dangerously-skip-permissions \
                -c -p "/commit-moonshot Phase $NEXT_PHASE 완료. 해당 페이즈 변경사항을 커밋해주세요."; then
                log_error "commit-moonshot failed"
                echo ""
                log_warn "Continue to next phase? (y/n)"
                read -r response
                if [[ "$response" != "y" ]]; then
                    break
                fi
            fi
            break
        else
            exit_code=$?
            if [[ $exit_code -eq 124 && "$WATCHDOG_AUTO_RESTART" == "true" ]]; then
                restart_count=$((restart_count + 1))
                log_warn "Phase $NEXT_PHASE timed out after ${WATCHDOG_MAX_SECONDS}s. Restarting... (attempt ${restart_count})"
                if [[ $WATCHDOG_MAX_RESTARTS -gt 0 && $restart_count -ge $WATCHDOG_MAX_RESTARTS ]]; then
                    log_error "Phase $NEXT_PHASE exceeded watchdog restart limit"
                    failed=$((failed + 1))
                    echo ""
                    log_warn "Continue to next phase? (y/n)"
                    read -r response
                    if [[ "$response" != "y" ]]; then
                        break
                    fi
                else
                    continue
                fi
            else
                log_error "Phase $NEXT_PHASE failed"
                failed=$((failed + 1))
                
                # Ask whether to continue
                echo ""
                log_warn "Continue to next phase? (y/n)"
                read -r response
                if [[ "$response" != "y" ]]; then
                    break
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
# Summary
# -----------------------------------------------------------------------------

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
