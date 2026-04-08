if [[ -z "${SCRIPT_DIR:-}" ]]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

normalize_qa_report_workflow_fields() {
    local qa_report_path="$1"

    if [[ ! -f "$qa_report_path" ]]; then
        return
    fi

    node "$SCRIPT_DIR/agent-loop-phase-artifacts.mjs" normalize-qa-report-workflow-fields "$qa_report_path"
}

append_qa_runtime_update() {
    local status="$1"
    local log_file="$2"
    local detail="${3:-}"
    node "$SCRIPT_DIR/agent-loop-phase-artifacts.mjs" append-qa-runtime-update \
        "$status" \
        "$log_file" \
        "$detail" \
        "${WORKFLOW_LOG_DIR:-}" \
        "${PHASE_QA_REPORT:-}" \
        "${PHASE_SCORECARD:-}"
}

record_phase_progress_checkpoint() {
    local stage="$1"
    local status="$2"
    local log_file="${3:-}"
    local detail="${4:-}"

    if [[ ! -f "$PHASE_QA_REPORT" ]] && [[ ! -f "$PHASE_SCORECARD" ]]; then
        return
    fi

    node "$SCRIPT_DIR/agent-loop-phase-artifacts.mjs" record-phase-progress-checkpoint \
        "${PHASE_QA_REPORT:-}" \
        "${PHASE_SCORECARD:-}" \
        "$stage" \
        "$status" \
        "$log_file" \
        "$detail" \
        "${RUNNER_RUNTIME:-}"
    normalize_qa_report_workflow_fields "$PHASE_QA_REPORT"
}

sync_clean_finish_artifacts() {
    local completion_artifacts="${1:-}"

    if [[ ! -f "$PHASE_QA_REPORT" ]] && [[ ! -f "$PHASE_SCORECARD" ]]; then
        return
    fi
    node "$SCRIPT_DIR/agent-loop-phase-artifacts.mjs" sync-clean-finish-artifacts \
        "$completion_artifacts" \
        "${PHASE_QA_REPORT:-}" \
        "${PHASE_SCORECARD:-}" \
        "${PHASE_TITLE:-Active phase}" \
        "${TARGET_COMPLETION_SCORE:-100}"
    normalize_qa_report_workflow_fields "$PHASE_QA_REPORT"
}

append_handoff_update() {
    local reason="$1"
    local log_file="$2"
    local detail="${3:-}"
    local normalized_reason

    case "$reason" in
        blocked|context_limit|user_pause|deferred_verification|interrupted)
            normalized_reason="$reason"
            ;;
        verification-command-missing)
            normalized_reason="blocked"
            ;;
        timeout-*|phase-timeout-*|timeout-runtime-fallback|timeout-restart-limit-exceeded)
            normalized_reason="interrupted"
            ;;
        missing-fresh-verification-evidence|verification-remediation-incomplete|auto-fix-succeeded-without-fresh-verification)
            normalized_reason="deferred_verification"
            ;;
        *)
            normalized_reason="blocked"
            ;;
    esac

    node "$SCRIPT_DIR/agent-loop-phase-artifacts.mjs" append-handoff-update \
        "$reason" \
        "$log_file" \
        "$detail" \
        "${NEXT_PHASE:-}" \
        "${PHASE_TITLE:-}" \
        "${PHASE_SPRINT_CONTRACT:-}" \
        "${PHASE_QA_REPORT:-}" \
        "${PHASE_DOC:-}" \
        "${PHASE_SCORECARD:-}" \
        "${PHASE_HANDOFF:-}"
}

write_clean_finish_handoff() {
    local phase_num="$1"
    local phase_title="$2"
    local phase_doc="$3"
    local phase_prefix

    printf -v phase_prefix '%02d' "$phase_num"

    node "$SCRIPT_DIR/agent-loop-phase-artifacts.mjs" write-clean-finish-handoff \
        "$phase_num" \
        "$phase_title" \
        "$phase_doc" \
        "${PHASE_SPRINT_CONTRACT:-}" \
        "${PHASE_QA_REPORT:-}" \
        "${PHASE_HANDOFF:-}"
}
