#!/usr/bin/env bash

# Generic repository verification harness.
# Purpose:
#   - run common repository checks
#   - emit a text log and JSON verdict artifact
#   - allow project-specific checks through opt-in hooks instead of hardcoded domain logic
#
# Exit codes:
#   0: all required checks passed
#   1: typecheck/build/lint/hook/general verification failure
#   2: test failure
#
# Harness outputs:
#   - text log: .claude/verification-results-<timestamp>.txt
#   - json verdict: .claude/verification-verdict-<runId>.json

set -eo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
  echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
  echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
  echo -e "${RED}❌ $1${NC}"
}

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

run_if_command_exists() {
  local cmd="$1"
  if bash -lc "command -v ${cmd%% *}" >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

has_npm_script() {
  local script_name="$1"
  if [ ! -f "package.json" ] || ! command -v node >/dev/null 2>&1; then
    return 1
  fi

  node -e '
    const fs = require("fs");
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    const key = process.argv[1];
    process.exit(pkg.scripts && pkg.scripts[key] ? 0 : 1);
  ' "$script_name" >/dev/null 2>&1
}

write_verdict_json() {
  local verdict="$1"
  local exit_code="$2"
  local finished_at="$3"
  local duration_ms="$4"

  local feature_escaped
  local results_file_escaped
  local verdict_file_escaped
  local operating_mode_escaped
  local contract_file_escaped
  local extra_hook_escaped

  feature_escaped="$(json_escape "$FEATURE_NAME")"
  results_file_escaped="$(json_escape "$RESULTS_FILE")"
  verdict_file_escaped="$(json_escape "$VERDICT_FILE")"
  operating_mode_escaped="$(json_escape "$OPERATING_MODE")"
  contract_file_escaped="$(json_escape "$CONTRACT_FILE")"
  extra_hook_escaped="$(json_escape "$EXTRA_CHECKS_CMD")"

  cat > "$VERDICT_FILE" <<JSON
{
  "runId": "${RUN_ID}",
  "script": "verify-changes.sh",
  "feature": "${feature_escaped}",
  "operatingMode": "${operating_mode_escaped}",
  "startedAt": "${STARTED_AT}",
  "finishedAt": "${finished_at}",
  "durationMs": ${duration_ms},
  "verdict": "${verdict}",
  "exitCode": ${exit_code},
  "checks": {
    "typecheck": "${TS_STATUS}",
    "build": "${BUILD_STATUS}",
    "test": "${TEST_STATUS}",
    "lint": "${LINT_STATUS}",
    "extraChecks": "${EXTRA_STATUS}",
    "testEnvironmentDetected": ${TEST_ENV_DETECTED}
  },
  "contract": {
    "path": "${contract_file_escaped}",
    "detected": ${CONTRACT_DETECTED},
    "extraChecksCommand": "${extra_hook_escaped}"
  },
  "artifacts": {
    "resultsFile": "${results_file_escaped}",
    "verdictFile": "${verdict_file_escaped}"
  }
}
JSON
}

finalize_and_exit() {
  local code="$1"
  local verdict="$2"

  local finished_at
  local end_epoch
  local duration_ms

  finished_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  end_epoch="$(date +%s)"
  duration_ms=$(( (end_epoch - START_EPOCH) * 1000 ))

  write_verdict_json "$verdict" "$code" "$finished_at" "$duration_ms"
  log_info "Harness verdict written: $VERDICT_FILE"
  exit "$code"
}

FEATURE_NAME=${1:-"changes"}
RUN_ID="${HARNESS_RUN_ID:-verify-changes-$(date +%Y%m%d-%H%M%S)}"
OPERATING_MODE="${HARNESS_OPERATING_MODE:-target_project}"
START_EPOCH="$(date +%s)"
STARTED_AT="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

CONTRACT_FILE="${VERIFICATION_CONTRACT_FILE:-.claude/verification.contract.yaml}"
EXTRA_CHECKS_CMD="${VERIFICATION_EXTRA_CHECKS_CMD:-}"

mkdir -p .claude
RESULTS_FILE=".claude/verification-results-$(date +%Y%m%d-%H%M%S).txt"
VERDICT_FILE="${HARNESS_VERDICT_FILE:-.claude/verification-verdict-${RUN_ID}.json}"

VERIFICATION_PASSED=true
BUILD_FAILED=false
TEST_FAILED=false
TEST_ENV_DETECTED=false
CONTRACT_DETECTED=false
TS_STATUS="not_run"
BUILD_STATUS="not_run"
TEST_STATUS="not_run"
LINT_STATUS="not_run"
EXTRA_STATUS="not_run"

if [ -f "$CONTRACT_FILE" ]; then
  CONTRACT_DETECTED=true
fi

echo ""
echo "======================================"
echo "  Generic Verification Harness"
echo "======================================"
echo ""

log_info "Target: $FEATURE_NAME"
log_info "Run ID: $RUN_ID"
log_info "Verification contract: $CONTRACT_FILE"
echo ""

echo "# Verification Results" > "$RESULTS_FILE"
echo "Date: $(date '+%Y-%m-%d %H:%M:%S')" >> "$RESULTS_FILE"
echo "Feature: $FEATURE_NAME" >> "$RESULTS_FILE"
echo "Run ID: $RUN_ID" >> "$RESULTS_FILE"
echo "Contract: $CONTRACT_FILE (detected=$CONTRACT_DETECTED)" >> "$RESULTS_FILE"
echo "" >> "$RESULTS_FILE"

log_info "TypeScript type check"
if command -v npx >/dev/null 2>&1 && [ -f "tsconfig.json" ]; then
  if npx tsc --noEmit 2>&1 | tee -a "$RESULTS_FILE"; then
    log_success "TypeScript check passed"
    TS_STATUS="passed"
  else
    log_error "TypeScript check failed"
    BUILD_FAILED=true
    VERIFICATION_PASSED=false
    TS_STATUS="failed"
  fi
else
  log_warning "Skipping typecheck (no tsconfig or npx unavailable)"
  TS_STATUS="skipped"
fi
echo ""

log_info "Build check"
if has_npm_script "build"; then
  if npm run build 2>&1 | tee -a "$RESULTS_FILE"; then
    log_success "Build passed"
    BUILD_STATUS="passed"
  else
    log_error "Build failed"
    BUILD_FAILED=true
    VERIFICATION_PASSED=false
    BUILD_STATUS="failed"
  fi
else
  log_warning "Skipping build (no build script)"
  BUILD_STATUS="skipped"
fi
echo ""

log_info "Test check"
if has_npm_script "test"; then
  TEST_ENV_DETECTED=true
  if CI=1 npm test 2>&1 | tee -a "$RESULTS_FILE"; then
    log_success "Tests passed"
    TEST_STATUS="passed"
  else
    log_error "Tests failed"
    TEST_FAILED=true
    VERIFICATION_PASSED=false
    TEST_STATUS="failed"
  fi
else
  log_warning "Skipping tests (no test script)"
  TEST_STATUS="skipped"
fi
echo ""

log_info "Lint check"
if has_npm_script "lint"; then
  if npm run lint 2>&1 | tee -a "$RESULTS_FILE"; then
    log_success "Lint passed"
    LINT_STATUS="passed"
  else
    log_warning "Lint reported warnings/failures"
    LINT_STATUS="warn"
  fi
else
  log_warning "Skipping lint (no lint script)"
  LINT_STATUS="skipped"
fi
echo ""

log_info "Project-specific extra checks"
if [ -n "$EXTRA_CHECKS_CMD" ]; then
  echo "ExtraChecksCommand: $EXTRA_CHECKS_CMD" >> "$RESULTS_FILE"
  if bash -lc "$EXTRA_CHECKS_CMD" 2>&1 | tee -a "$RESULTS_FILE"; then
    log_success "Extra checks passed"
    EXTRA_STATUS="passed"
  else
    log_error "Extra checks failed"
    BUILD_FAILED=true
    VERIFICATION_PASSED=false
    EXTRA_STATUS="failed"
  fi
else
  log_info "No extra checks command configured"
  EXTRA_STATUS="skipped"
fi
echo ""

log_info "Git status snapshot"
echo "" >> "$RESULTS_FILE"
echo "## Git Status" >> "$RESULTS_FILE"
echo "" >> "$RESULTS_FILE"
STAGED_FILES="$(git diff --cached --name-only || true)"
if [ -z "$STAGED_FILES" ]; then
  log_warning "No staged files"
  echo "No staged files" >> "$RESULTS_FILE"
else
  echo "$STAGED_FILES" | while read -r file; do
    [ -n "$file" ] || continue
    echo "- $file" >> "$RESULTS_FILE"
  done
fi
echo ""

if [ "$VERIFICATION_PASSED" = true ]; then
  log_success "All required verification checks passed"
  finalize_and_exit 0 "passed"
fi

if [ "$BUILD_FAILED" = true ]; then
  finalize_and_exit 1 "failed"
fi

if [ "$TEST_FAILED" = true ]; then
  finalize_and_exit 2 "failed"
fi

finalize_and_exit 1 "failed"
