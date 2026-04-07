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

AGENT_LOOP_PHASE_RUNTIME_CHILD_PIDS=()

agent_loop_phase_runtime_cleanup_child_pid() {
  local pid="$1"
  if [[ -z "$pid" ]]; then
    return
  fi

  if ! kill -0 "$pid" >/dev/null 2>&1; then
    return
  fi

  local pgid
  pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d '[:space:]')"

  if [[ -n "$pgid" ]]; then
    kill -TERM -- "-$pgid" 2>/dev/null || true
  else
    kill -TERM -- "$pid" 2>/dev/null || true
  fi

  local timeout_seconds=5
  local elapsed=0
  while [[ $elapsed -lt $timeout_seconds ]] && kill -0 "$pid" >/dev/null 2>&1; do
    sleep 0.5
    elapsed=$((elapsed + 1))
  done

  if kill -0 "$pid" >/dev/null 2>&1; then
    if [[ -n "$pgid" ]]; then
      kill -KILL -- "-$pgid" 2>/dev/null || true
    else
      kill -KILL -- "$pid" 2>/dev/null || true
    fi
  fi
}

agent_loop_phase_runtime_untrack_pid() {
  local pid="$1"
  local remaining=()
  local existing

  for existing in "${AGENT_LOOP_PHASE_RUNTIME_CHILD_PIDS[@]}"; do
    if [[ "$existing" != "$pid" ]]; then
      remaining+=("$existing")
    fi
  done
  AGENT_LOOP_PHASE_RUNTIME_CHILD_PIDS=("${remaining[@]:-}")
}

agent_loop_phase_runtime_on_exit() {
  local pid
  for pid in "${AGENT_LOOP_PHASE_RUNTIME_CHILD_PIDS[@]}"; do
    agent_loop_phase_runtime_cleanup_child_pid "$pid"
  done
}

agent_loop_phase_runtime_start_worker() {
  local log_file="$1"
  shift
  local -a cmd=("$@")

  if command -v setsid >/dev/null 2>&1; then
    setsid "${cmd[@]}" >> "$log_file" 2>&1 &
  else
    "${cmd[@]}" >> "$log_file" 2>&1 &
  fi

  local pid=$!
  AGENT_LOOP_PHASE_RUNTIME_CHILD_PIDS+=("$pid")
  printf '%s\n' "$pid"
}

trap agent_loop_phase_runtime_on_exit EXIT INT TERM HUP

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
            cmd=(env "${phase_env[@]}" claude --dangerously-skip-permissions --no-session-persistence -p "$prompt")
            ;;
        codex)
            cmd=(env "${phase_env[@]}" codex exec --full-auto -C "$PWD")
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
            run_with_watchdog "$log_file" claude --dangerously-skip-permissions --no-session-persistence -c -p "$prompt" || true
            ;;
        codex)
            local -a cmd=(codex exec --full-auto -C "$PWD")
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

    local start_time
    start_time=$(date +%s)
    local timed_out=false
    local pid

    set +e
    pid="$(agent_loop_phase_runtime_start_worker "$log_file" "$@")"

    while kill -0 "$pid" 2>/dev/null; do
        local now
        now=$(date +%s)
        local elapsed=$((now - start_time))
        if [[ $WATCHDOG_MAX_SECONDS -gt 0 && $elapsed -ge $WATCHDOG_MAX_SECONDS ]]; then
            timed_out=true
            agent_loop_phase_runtime_cleanup_child_pid "$pid"
            break
        fi
        sleep "$WATCHDOG_CHECK_SECONDS"
    done

    wait "$pid"
    local exit_code=$?
    agent_loop_phase_runtime_untrack_pid "$pid"
    set -e

    if [[ "$timed_out" == "true" ]]; then
        echo "WATCHDOG_TIMEOUT after ${WATCHDOG_MAX_SECONDS}s" >> "$log_file"
        return 124
    fi
    return "$exit_code"
}

run_worker_prompt_with_completion_gate() {
    local log_file="$1"
    local phase_start_epoch="$2"
    local qa_checksum_before="$3"
    shift 3

    local start_time
    start_time=$(date +%s)
    local timed_out=false
    local completed_early=false
    local pid

    set +e
    pid="$(agent_loop_phase_runtime_start_worker "$log_file" "$@")"

    while kill -0 "$pid" 2>/dev/null; do
        local now
        now=$(date +%s)
        local elapsed=$((now - start_time))

        if [[ -n "$qa_checksum_before" ]]; then
            local qa_checksum_now
            qa_checksum_now="$(file_checksum_or_empty "$PHASE_QA_REPORT")"
            if [[ "$qa_checksum_now" != "$qa_checksum_before" ]]; then
                evaluate_phase_completion_gate "$phase_start_epoch"
                if [[ "$PHASE_COMPLETION_ALLOWED" == "true" ]]; then
                    completed_early=true
                    agent_loop_phase_runtime_cleanup_child_pid "$pid"
                    break
                fi
            fi
        fi

        if [[ $WATCHDOG_MAX_SECONDS -gt 0 && $elapsed -ge $WATCHDOG_MAX_SECONDS ]]; then
            timed_out=true
            agent_loop_phase_runtime_cleanup_child_pid "$pid"
            break
        fi

        sleep "$WATCHDOG_CHECK_SECONDS"
    done

    wait "$pid"
    local exit_code=$?
    agent_loop_phase_runtime_untrack_pid "$pid"
    set -e

    if [[ "$completed_early" == "true" ]]; then
        echo "EARLY_COMPLETION_GATE satisfied; worker terminated after fresh verification evidence." >> "$log_file"
        return 0
    fi

    if [[ "$timed_out" == "true" ]]; then
        echo "WATCHDOG_TIMEOUT after ${WATCHDOG_MAX_SECONDS}s" >> "$log_file"
        return 124
    fi

    return "$exit_code"
}
