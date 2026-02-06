#!/bin/bash
# =============================================================================
# Agent Loop - Autonomous Claude Code Execution
# =============================================================================
# Based on: https://www.anthropic.com/engineering/building-c-compiler
#
# Usage:
#   ./agent-loop.sh [options]
#
# Options:
#   --iterations N    Maximum iterations (default: unlimited)
#   --delay N         Delay between iterations in seconds (default: 5)
#   --dry-run         Print what would be executed without running
#   --help            Show this help message
#
# Prerequisites:
#   - Claude Code CLI installed and authenticated
#   - AGENT_PROMPT.md in the same directory
# =============================================================================

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${SCRIPT_DIR}/agent_logs"
PROMPT_FILE="${SCRIPT_DIR}/AGENT_PROMPT.md"
LOCK_DIR="${SCRIPT_DIR}/.claude/current_tasks"
MAX_ITERATIONS=0  # 0 = unlimited
DELAY_SECONDS=5
DRY_RUN=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# -----------------------------------------------------------------------------
# Helper Functions
# -----------------------------------------------------------------------------

log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

show_help() {
    head -25 "$0" | tail -20
    exit 0
}

# -----------------------------------------------------------------------------
# Parse Arguments
# -----------------------------------------------------------------------------

while [[ $# -gt 0 ]]; do
    case $1 in
        --iterations)
            MAX_ITERATIONS="$2"
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

if [[ ! -f "$PROMPT_FILE" ]]; then
    log_error "AGENT_PROMPT.md not found at: $PROMPT_FILE"
    log_info "Please create AGENT_PROMPT.md with your agent instructions."
    exit 1
fi

if ! command -v claude &> /dev/null; then
    log_error "Claude CLI not found. Please install it first."
    exit 1
fi

# Create directories
mkdir -p "$LOG_DIR"
mkdir -p "$LOCK_DIR"

# -----------------------------------------------------------------------------
# Lock Management (flock-based for same-directory agents)
# -----------------------------------------------------------------------------

acquire_lock() {
    local task_name="$1"
    local lock_file="${LOCK_DIR}/${task_name}.lock"
    
    exec 200>"$lock_file"
    if flock -n 200; then
        echo "$$" > "$lock_file"
        log_info "Lock acquired: $task_name"
        return 0
    else
        log_warn "Task already locked: $task_name"
        return 1
    fi
}

release_lock() {
    local task_name="$1"
    local lock_file="${LOCK_DIR}/${task_name}.lock"
    
    if [[ -f "$lock_file" ]]; then
        rm -f "$lock_file"
        log_info "Lock released: $task_name"
    fi
}

# Cleanup on exit
cleanup() {
    log_info "Cleaning up locks..."
    rm -f "${LOCK_DIR}"/*.lock 2>/dev/null || true
    log_info "Agent loop terminated."
}
trap cleanup EXIT

# -----------------------------------------------------------------------------
# Main Loop
# -----------------------------------------------------------------------------

log_info "=== Agent Loop Started ==="
log_info "Prompt file: $PROMPT_FILE"
log_info "Log directory: $LOG_DIR"
log_info "Max iterations: ${MAX_ITERATIONS:-unlimited}"
log_info "Delay between iterations: ${DELAY_SECONDS}s"

iteration=0

while true; do
    iteration=$((iteration + 1))
    
    # Check iteration limit
    if [[ $MAX_ITERATIONS -gt 0 && $iteration -gt $MAX_ITERATIONS ]]; then
        log_info "Reached maximum iterations ($MAX_ITERATIONS). Exiting."
        break
    fi
    
    # Generate unique identifiers
    COMMIT=$(git rev-parse --short=6 HEAD 2>/dev/null || echo "nocommit")
    TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
    LOGFILE="${LOG_DIR}/agent_${TIMESTAMP}_${COMMIT}.log"
    
    log_info "=== Iteration $iteration ==="
    log_info "Current commit: $COMMIT"
    log_info "Log file: $LOGFILE"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_warn "[DRY-RUN] Would execute: claude -p \"\$(cat $PROMPT_FILE)\""
        sleep "$DELAY_SECONDS"
        continue
    fi
    
    # Execute Claude session
    log_info "Starting Claude session..."
    
    if claude --dangerously-skip-permissions \
        -p "$(cat "$PROMPT_FILE")" \
        &> "$LOGFILE"; then
        log_success "Claude session completed successfully."
    else
        exit_code=$?
        log_warn "Claude session exited with code: $exit_code"
        
        # Check if it was a self-termination (pkill -9 bash scenario)
        if [[ $exit_code -eq 137 || $exit_code -eq 143 ]]; then
            log_error "Session was killed. Stopping loop."
            break
        fi
    fi
    
    # Log summary
    if [[ -f "$LOGFILE" ]]; then
        lines=$(wc -l < "$LOGFILE")
        log_info "Session log: $lines lines written"
    fi
    
    # Delay before next iteration
    log_info "Waiting ${DELAY_SECONDS}s before next iteration..."
    sleep "$DELAY_SECONDS"
done

log_info "=== Agent Loop Completed ==="
log_info "Total iterations: $iteration"
