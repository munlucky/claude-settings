if [[ -z "${SCRIPT_DIR:-}" ]]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

resolve_runner_runtime() {
    node "$SCRIPT_DIR/agent-loop-phase-runtime.mjs" resolve-runner-runtime "${RUNNER_RUNTIME:-auto}"
}

describe_stop_reason() {
    node "$SCRIPT_DIR/agent-loop-phase-runtime.mjs" describe-stop-reason "$1" "${2:-}" "${3:-}"
}

detect_verification_command_missing() {
    local reason
    reason="$(node "$SCRIPT_DIR/agent-loop-phase-runtime.mjs" detect-final-stop-reason "${1:-}" "phase-failed" "${TOOL_SCHEMA_ERROR_GUARD:-2}")"
    [[ "$reason" == "verification-command-missing" ]]
}

detect_tool_schema_error_loop() {
    local reason
    reason="$(node "$SCRIPT_DIR/agent-loop-phase-runtime.mjs" detect-final-stop-reason "${1:-}" "phase-failed" "${TOOL_SCHEMA_ERROR_GUARD:-2}")"
    [[ "$reason" == "tool-schema-error-loop" ]]
}

classify_timeout_reason() {
    node "$SCRIPT_DIR/agent-loop-phase-runtime.mjs" classify-timeout-reason "${1:-}"
}

resolve_timeout_fallback_runtime() {
    node "$SCRIPT_DIR/agent-loop-phase-runtime.mjs" resolve-timeout-fallback-runtime "${1:-}"
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
    phase_env+=("WORKSPACE_ROOT=${WORKSPACE_ROOT:-$PWD}")
    if [[ -n "${EXECUTION_ROOT:-}" ]]; then
        phase_env+=("HARNESS_REQUIREMENTS_TRACEABILITY_FILE=${EXECUTION_ROOT}/REQUIREMENTS_TRACEABILITY.md")
        phase_env+=("HARNESS_SCENARIO_MATRIX_FILE=${EXECUTION_ROOT}/SCENARIO_MATRIX.md")
        phase_env+=("HARNESS_UAT_CHECKLIST_FILE=${EXECUTION_ROOT}/UAT_CHECKLIST.md")
    fi

    case "$RUNNER_RUNTIME" in
        claude)
            cmd=(env "${phase_env[@]}" claude)
            if [[ -n "${CLAUDE_MODEL:-}" ]]; then
                cmd+=(--model "$CLAUDE_MODEL")
            fi
            if [[ -n "${CLAUDE_EFFORT:-}" ]]; then
                cmd+=(--effort "$CLAUDE_EFFORT")
            fi
            cmd+=(--dangerously-skip-permissions --no-session-persistence -p "$prompt")
            ;;
        codex)
            cmd=(env "${phase_env[@]}")
            runtime_cli_append_codex_base_args cmd "$PWD"
            if [[ -n "${CODEX_MODEL:-}" ]]; then
                cmd+=(-m "$CODEX_MODEL")
            fi
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
            local -a cmd=(claude)
            if [[ -n "${CLAUDE_MODEL:-}" ]]; then
                cmd+=(--model "$CLAUDE_MODEL")
            fi
            if [[ -n "${CLAUDE_EFFORT:-}" ]]; then
                cmd+=(--effort "$CLAUDE_EFFORT")
            fi
            cmd+=(--dangerously-skip-permissions --no-session-persistence -c -p "$prompt")
            run_with_watchdog "$log_file" "${cmd[@]}" || true
            ;;
        codex)
            local -a cmd=()
            runtime_cli_append_codex_base_args cmd "$PWD"
            if [[ -n "${CODEX_MODEL:-}" ]]; then
                cmd+=(-m "$CODEX_MODEL")
            fi
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

run_with_watchdog() {
    local log_file="$1"
    shift
    node "$SCRIPT_DIR/agent-loop-phase-runtime.mjs" run-with-watchdog \
        --log-file "$log_file" \
        --max-seconds "${WATCHDOG_MAX_SECONDS:-0}" \
        --check-seconds "${WATCHDOG_CHECK_SECONDS:-5}" \
        -- "$@"
}

run_worker_prompt_with_completion_gate() {
    local log_file="$1"
    local phase_start_epoch="$2"
    local qa_checksum_before="$3"
    shift 3
    node "$SCRIPT_DIR/agent-loop-phase-runtime.mjs" run-worker-prompt-with-completion-gate \
        --log-file "$log_file" \
        --phase-start-epoch "$phase_start_epoch" \
        --qa-checksum-before "$qa_checksum_before" \
        --phase-qa-report "${PHASE_QA_REPORT:-}" \
        --phase-scorecard "${PHASE_SCORECARD:-}" \
        --phase-execution-dir "${PHASE_EXECUTION_DIR:-}" \
        --scorecard-required "${SCORECARD_REQUIRED:-true}" \
        --target-completion-score "${TARGET_COMPLETION_SCORE:-100}" \
        --watchdog-max-seconds "${WATCHDOG_MAX_SECONDS:-0}" \
        --watchdog-check-seconds "${WATCHDOG_CHECK_SECONDS:-5}" \
        -- "$@"
}
