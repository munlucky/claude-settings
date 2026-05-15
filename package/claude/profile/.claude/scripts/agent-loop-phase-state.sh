if [[ -z "${SCRIPT_DIR:-}" ]]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

evaluate_phase_completion_gate() {
    local phase_start_epoch="$1"
    local eval_output

    eval_output="$(node "$SCRIPT_DIR/agent-loop-phase-state.mjs" evaluate-phase-completion-gate \
        "$phase_start_epoch" \
        "${PHASE_QA_REPORT:-}" \
        "${PHASE_SCORECARD:-}" \
        "${PHASE_EXECUTION_DIR:-}" \
        "${SCORECARD_REQUIRED:-true}" \
        "${TARGET_COMPLETION_SCORE:-100}" \
        "${PHASE_HANDOFF:-}")"

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

    if [[ ! -f "$STATUS_FILE" ]]; then
        return
    fi

    node "$SCRIPT_DIR/agent-loop-phase-state.mjs" update-phase-state \
        "$STATUS_FILE" \
        "$phase_num" \
        "$new_status" \
        "$timestamp" \
        "$last_outcome" \
        "$increment_attempt" \
        "$active_phase_doc" \
        "$sprint_contract_path" \
        "$qa_report_path" \
        "$handoff_path" \
        "$scorecard_path"
}

list_stale_in_progress_phases() {
    local stale_seconds="${1:-1800}"

    if [[ ! -f "$STATUS_FILE" ]]; then
        return
    fi

    node "$SCRIPT_DIR/agent-loop-phase-state.mjs" list-stale-in-progress-phases "$STATUS_FILE" "$stale_seconds"
}
