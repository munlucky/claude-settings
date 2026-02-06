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
        grep -A2 "status:" "$STATUS_FILE" 2>/dev/null | \
            grep -B1 "pending\|in_progress" | \
            grep "number:" | \
            head -1 | \
            sed 's/.*number: //' | \
            tr -d ' '
    else
        echo "1"
    fi
}

get_phase_title() {
    local phase_num=$1
    local phase_doc=$(find "$PLAN_DIR" -name "${phase_num:0:2}*" -o -name "*phase*${phase_num}*" 2>/dev/null | head -1)
    if [[ -n "$phase_doc" ]]; then
        head -5 "$phase_doc" | grep -E "^#" | head -1 | sed 's/^#* //'
    else
        echo "Phase $phase_num"
    fi
}

count_total_phases() {
    find "$PLAN_DIR" -maxdepth 1 -name "*.md" ! -name "*master*" ! -name "*00-*" 2>/dev/null | wc -l | tr -d ' '
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
    
    if claude --dangerously-skip-permissions \
        -p "Phase $NEXT_PHASE 를 구현해주세요. 계획 문서: $PLAN_DIR" \
        2>&1 | tee "$LOGFILE"; then
        
        END_TIME=$(date +%s)
        DURATION=$((END_TIME - START_TIME))
        log_success "Phase $NEXT_PHASE completed (${DURATION}s)"
        completed=$((completed + 1))
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
