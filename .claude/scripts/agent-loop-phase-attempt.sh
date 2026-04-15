if [[ -z "${SCRIPT_DIR:-}" ]]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

decide_missing_evidence_action() {
    node "$SCRIPT_DIR/agent-loop-phase-attempt.mjs" decide-missing-evidence-action \
        "${1:-0}" \
        "${2:-0}" \
        "${3:-false}" \
        "${4:-false}" \
        "${5:-missing-verification-evidence}"
}

decide_timeout_action() {
    node "$SCRIPT_DIR/agent-loop-phase-attempt.mjs" decide-timeout-action \
        "${1:-0}" \
        "${2:-0}" \
        "${3:-false}" \
        "${4:-false}" \
        "${5:-}" \
        "${6:-}" \
        "${7:-false}" \
        "${8:-false}"
}

decide_failure_action() {
    node "$SCRIPT_DIR/agent-loop-phase-attempt.mjs" decide-failure-action \
        "${1:-0}" \
        "${2:-0}" \
        "${3:-false}" \
        "${4:-false}" \
        "${5:-phase-failed}"
}

build_verification_remediation_prompt() {
    node "$SCRIPT_DIR/agent-loop-phase-attempt.mjs" build-verification-remediation-prompt \
        "${1:-}" \
        "${2:-}" \
        "${3:-}"
}

build_auto_fix_prompt() {
    node "$SCRIPT_DIR/agent-loop-phase-attempt.mjs" build-auto-fix-prompt \
        "${1:-}" \
        "${2:-}"
}
