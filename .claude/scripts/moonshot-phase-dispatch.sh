#!/bin/bash
# =============================================================================
# Moonshot Phase Dispatch
# =============================================================================
# Unified command-layer adapter for phase execution.
# - delegated-terminal      -> agent-loop.sh
# - in-session-coordinator  -> moonshot-in-session-coordinator via Claude or Codex CLI
#
# Usage:
#   ./moonshot-phase-dispatch.sh <plan-dir> [options]
#
# Options:
#   --execution-mode <mode>   auto|delegated-terminal|in-session-coordinator
#   --status-file <path>      Default: .claude/docs/phase-status.yaml
#   --execution-root <path>   Default: <plan-dir>/execution
#   --runtime <runtime>       auto|claude|codex
#   --max-attempts <n>        Default: 3 (coordinator mode)
#   --stop-on-failure         Stop when retry cap is reached (default)
#   --continue-on-failure     Keep going after failure
#   --autonomous              Reserved for compatibility (agent-loop is autonomous by default)
#   --dry-run                 Print resolved command without executing
# =============================================================================

set -euo pipefail

PLAN_DIR=""
EXECUTION_MODE="auto"
STATUS_FILE=".claude/docs/phase-status.yaml"
EXECUTION_ROOT=""
RUNTIME="auto"
MAX_ATTEMPTS=3
STOP_ON_FAILURE=true
AUTONOMOUS=false
DRY_RUN=false
CODEX_REASONING_EFFORT="${PHASE_DISPATCH_CODEX_REASONING_EFFORT:-${MOONSHOT_CODEX_REASONING_EFFORT:-medium}}"

show_help() {
    head -24 "$0" | tail -19
    exit 0
}

log_info() {
    echo "INFO: $1"
}

log_warn() {
    echo "WARN: $1"
}

log_error() {
    echo "ERROR: $1" >&2
}

strip_quotes() {
    local value="$1"
    value="${value%\"}"
    value="${value#\"}"
    echo "$value"
}

resolve_status_value() {
    local key="$1"
    if [[ ! -f "$STATUS_FILE" ]]; then
        return 1
    fi

    awk -v search_key="$key" '
        $1 == search_key ":" {
            print $2
            exit
        }
    ' "$STATUS_FILE"
}

resolve_execution_mode() {
    if [[ "$EXECUTION_MODE" != "auto" ]]; then
        echo "$EXECUTION_MODE"
        return
    fi

    local status_mode
    status_mode="$(resolve_status_value "executionMode" 2>/dev/null || true)"
    status_mode="$(strip_quotes "$status_mode")"

    if [[ -n "$status_mode" ]]; then
        echo "$status_mode"
    else
        echo "delegated-terminal"
    fi
}

resolve_execution_root() {
    if [[ -n "$EXECUTION_ROOT" ]]; then
        echo "$EXECUTION_ROOT"
        return
    fi

    local status_root
    status_root="$(resolve_status_value "executionRoot" 2>/dev/null || true)"
    status_root="$(strip_quotes "$status_root")"

    if [[ -n "$status_root" ]]; then
        echo "$status_root"
    else
        echo "${PLAN_DIR%/}/execution"
    fi
}

resolve_master_plan() {
    find "$PLAN_DIR" -maxdepth 1 \( -name "*master*" -o -name "*00-*" \) 2>/dev/null | head -1
}

ensure_claude() {
    if ! command -v claude >/dev/null 2>&1; then
        log_error "Claude CLI not found"
        exit 1
    fi
}

ensure_codex() {
    if ! command -v codex >/dev/null 2>&1; then
        log_error "Codex CLI not found"
        exit 1
    fi
}

run_delegated_terminal() {
    local resolved_root="$1"
    local cmd=(bash ".claude/scripts/agent-loop.sh" "$PLAN_DIR" "--status-file" "$STATUS_FILE" "--execution-root" "$resolved_root" "--runtime" "$RUNTIME")

    if [[ "$DRY_RUN" == "true" ]]; then
        printf '%s\n' "${cmd[*]}"
        return
    fi

    exec "${cmd[@]}"
}

run_in_session_coordinator() {
    local resolved_root="$1"
    local master_plan="$2"
    local stop_line="  stopOnFailure: true"

    if [[ "$STOP_ON_FAILURE" != "true" ]]; then
        stop_line="  stopOnFailure: false"
    fi

    local prompt
    prompt=$(cat <<EOF
/moonshot-in-session-coordinator
phaseRunnerResult:
  prepared: true
  executionMode: "in-session-coordinator"
  planDir: "$PLAN_DIR"
  masterPlan: "$master_plan"
  phaseStatusFile: "$STATUS_FILE"
  executionRoot: "$resolved_root"
  coordinatorPolicy: "fresh-fork-per-attempt"

options:
  maxAttemptsPerPhase: $MAX_ATTEMPTS
$stop_line

runtimeCompatibility:
  fallback: "If /moonshot-in-session-coordinator is unavailable in this runtime, execute the equivalent coordinator contract directly without searching for missing slash skills."
EOF
)

    local cmd=()

    if [[ "$RUNTIME" == "auto" ]]; then
        if command -v codex >/dev/null 2>&1; then
            RUNTIME="codex"
        else
            RUNTIME="claude"
        fi
    fi

    case "$RUNTIME" in
        claude)
            ensure_claude
            cmd=(claude --dangerously-skip-permissions --no-session-persistence -p "$prompt")
            ;;
        codex)
            ensure_codex
            cmd=(codex exec --full-auto -C "$PWD")
            if [[ -n "$CODEX_REASONING_EFFORT" ]]; then
                cmd+=(-c "model_reasoning_effort=\"$CODEX_REASONING_EFFORT\"")
            fi
            cmd+=("$prompt")
            ;;
        *)
            log_error "Unsupported runtime for in-session coordinator: $RUNTIME"
            exit 1
            ;;
    esac

    if [[ "$DRY_RUN" == "true" ]]; then
        printf '%s\n' "${cmd[*]}"
        return
    fi

    exec "${cmd[@]}"
}

if [[ $# -gt 0 && ! "$1" =~ ^-- ]]; then
    PLAN_DIR="$1"
    shift
fi

while [[ $# -gt 0 ]]; do
    case "$1" in
        --execution-mode)
            EXECUTION_MODE="$2"
            shift 2
            ;;
        --status-file)
            STATUS_FILE="$2"
            shift 2
            ;;
        --execution-root)
            EXECUTION_ROOT="$2"
            shift 2
            ;;
        --runtime)
            RUNTIME="$2"
            shift 2
            ;;
        --max-attempts)
            MAX_ATTEMPTS="$2"
            shift 2
            ;;
        --stop-on-failure)
            STOP_ON_FAILURE=true
            shift
            ;;
        --continue-on-failure)
            STOP_ON_FAILURE=false
            shift
            ;;
        --autonomous)
            AUTONOMOUS=true
            shift
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
    show_help
fi

if [[ ! -d "$PLAN_DIR" ]]; then
    log_error "Plan directory not found: $PLAN_DIR"
    exit 1
fi

if [[ "$RUNTIME" != "auto" && "$RUNTIME" != "claude" && "$RUNTIME" != "codex" ]]; then
    log_warn "Unsupported runtime '$RUNTIME'. Falling back to 'auto'."
    RUNTIME="auto"
fi

RESOLVED_MODE="$(resolve_execution_mode)"
RESOLVED_ROOT="$(resolve_execution_root)"
MASTER_PLAN="$(resolve_master_plan)"

if [[ -z "$MASTER_PLAN" ]]; then
    log_error "Master plan not found in: $PLAN_DIR"
    exit 1
fi

mkdir -p "$RESOLVED_ROOT"

log_info "Plan directory: $PLAN_DIR"
log_info "Execution mode: $RESOLVED_MODE"
log_info "Execution root: $RESOLVED_ROOT"
log_info "Runtime: $RUNTIME"
if [[ "$AUTONOMOUS" == "true" ]]; then
    log_info "Autonomous flag acknowledged (delegated terminal is autonomous by default)"
fi

case "$RESOLVED_MODE" in
    delegated-terminal)
        run_delegated_terminal "$RESOLVED_ROOT"
        ;;
    in-session-coordinator)
        run_in_session_coordinator "$RESOLVED_ROOT" "$MASTER_PLAN"
        ;;
    *)
        log_error "Unsupported execution mode: $RESOLVED_MODE"
        exit 1
        ;;
esac
