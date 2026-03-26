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

join_lines() {
  printf '%s\n' "$@" | sed '/^$/d'
}

safe_var_name() {
  printf '%s' "$1" | tr -c 'A-Za-z0-9_' '_'
}

get_contract_command() {
  local check_name="$1"
  local safe_name
  safe_name="$(safe_var_name "$check_name")"
  eval "printf '%s' \"\${CONTRACT_COMMAND__${safe_name}:-}\""
}

append_check_result() {
  local check_name="$1"
  local status="$2"

  if [ -n "$CONTRACT_CHECK_RESULTS_LINES" ]; then
    CONTRACT_CHECK_RESULTS_LINES="${CONTRACT_CHECK_RESULTS_LINES}
${check_name}=${status}"
  else
    CONTRACT_CHECK_RESULTS_LINES="${check_name}=${status}"
  fi
}

check_is_skipped() {
  local check_name="$1"
  local raw_list="${VERIFY_CHANGES_SKIP_CHECKS:-}"
  local item

  raw_list="${raw_list//,/ }"
  for item in $raw_list; do
    if [ "$item" = "$check_name" ]; then
      return 0
    fi
  done
  return 1
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

collect_changed_files() {
  local status_file

  CHANGED_FILES=()
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    return 0
  fi

  status_file="$(mktemp)"
  git status --short 2>/dev/null > "$status_file" || true

  while IFS= read -r line; do
    local path
    path="${line#?? }"
    path="${path##* -> }"
    [ -n "$path" ] || continue
    CHANGED_FILES+=("$path")
  done < "$status_file"

  rm -f "$status_file"
}

load_contract_context() {
  local eval_output
  local changed_files_text

  CONTRACT_DETECTED=false
  CONTRACT_APPLICABLE=false
  CONTRACT_SCOPE_MATCHED=false
  CONTRACT_FALLBACK_OUTSIDE_SCOPE=true
  VERIFICATION_MODE="fallback"
  CONTRACT_SCOPE_REASON="no_contract"
  CONTRACT_COMMAND_NAMES=()
  CONTRACT_REQUIRED_CHECKS=()
  CONTRACT_OPTIONAL_CHECKS=()
  CONTRACT_HOOK_EXTRA_CHECKS=""

  if [ ! -f "$CONTRACT_FILE" ]; then
    return 0
  fi

  CONTRACT_DETECTED=true
  changed_files_text="$(join_lines "${CHANGED_FILES[@]}")"

  eval_output="$(CHANGED_FILES_TEXT="$changed_files_text" python3 - "$CONTRACT_FILE" "$OPERATING_MODE" <<'PY'
import fnmatch
import os
import shlex
import sys


def parse_scalar(value):
    value = value.strip()
    if value in ("true", "false"):
        return value == "true"
    if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
        return value[1:-1]
    return value


def next_meaningful(lines, start_index):
    for idx in range(start_index + 1, len(lines)):
        stripped = lines[idx].strip()
        if not stripped or stripped.startswith("#"):
            continue
        indent = len(lines[idx]) - len(lines[idx].lstrip(" "))
        return indent, stripped
    return None, None


def parse_simple_yaml(path):
    with open(path, "r", encoding="utf-8") as handle:
        lines = handle.read().splitlines()

    root = {}
    stack = [(-1, root)]

    for index, raw_line in enumerate(lines):
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        indent = len(raw_line) - len(raw_line.lstrip(" "))
        while len(stack) > 1 and indent <= stack[-1][0]:
            stack.pop()

        container = stack[-1][1]

        if stripped.startswith("- "):
            if not isinstance(container, list):
                continue
            container.append(parse_scalar(stripped[2:]))
            continue

        key, _, value = stripped.partition(":")
        key = key.strip()
        value = value.strip()

        if not key:
            continue

        if value == "":
            next_indent, next_stripped = next_meaningful(lines, index)
            if next_indent is not None and next_indent > indent and next_stripped.startswith("- "):
                nested = []
            else:
                nested = {}
            if isinstance(container, dict):
                container[key] = nested
                stack.append((indent, nested))
            continue

        if isinstance(container, dict):
            container[key] = parse_scalar(value)

    return root


def as_list(value):
    if isinstance(value, list):
        return [item for item in value if isinstance(item, (str, int, float, bool))]
    if value in (None, ""):
        return []
    return [value]


def emit(name, value):
    print(f"{name}={shlex.quote(value)}")


contract_path = sys.argv[1]
operating_mode = sys.argv[2]
changed_files = [line for line in os.environ.get("CHANGED_FILES_TEXT", "").splitlines() if line]

contract = parse_simple_yaml(contract_path)
scope = contract.get("scope", {}) if isinstance(contract.get("scope"), dict) else {}
policy = contract.get("policy", {}) if isinstance(contract.get("policy"), dict) else {}
hooks = contract.get("hooks", {}) if isinstance(contract.get("hooks"), dict) else {}
commands = contract.get("commands", {}) if isinstance(contract.get("commands"), dict) else {}

execution_planes = [str(item) for item in as_list(scope.get("executionPlanes"))]
path_patterns = [str(item) for item in as_list(scope.get("paths"))]
required_checks = [str(item) for item in as_list(policy.get("requiredChecks"))]
optional_checks = [str(item) for item in as_list(policy.get("optionalChecks"))]
fallback_outside_scope = bool(scope.get("fallbackOutsideScope", True))

scope_defined = bool(execution_planes or path_patterns)
plane_matched = operating_mode in execution_planes if execution_planes else False
path_matched = False
if path_patterns and changed_files:
    for changed_path in changed_files:
        if any(fnmatch.fnmatch(changed_path, pattern) for pattern in path_patterns):
            path_matched = True
            break

scope_matched = True if not scope_defined else (plane_matched or path_matched)
contract_has_checks = bool(commands or required_checks or optional_checks or hooks.get("extraChecksCommand"))
applicable = scope_matched and contract_has_checks

mode = "contract" if applicable else ("workspace" if fallback_outside_scope else "fallback")
if not scope_matched:
    reason = "scope_mismatch"
elif not contract_has_checks:
    reason = "no_harness_checks"
elif not scope_defined:
    reason = "no_scope"
elif plane_matched:
    reason = "execution_plane"
elif path_matched:
    reason = "changed_paths"
else:
    reason = "scope_match"

emit("CONTRACT_APPLICABLE", "true" if applicable else "false")
emit("CONTRACT_SCOPE_MATCHED", "true" if scope_matched else "false")
emit("CONTRACT_FALLBACK_OUTSIDE_SCOPE", "true" if fallback_outside_scope else "false")
emit("VERIFICATION_MODE", mode)
emit("CONTRACT_SCOPE_REASON", reason)
emit("CONTRACT_HOOK_EXTRA_CHECKS", str(hooks.get("extraChecksCommand", "")))
print("CONTRACT_REQUIRED_CHECKS=(" + " ".join(shlex.quote(item) for item in required_checks) + ")")
print("CONTRACT_OPTIONAL_CHECKS=(" + " ".join(shlex.quote(item) for item in optional_checks) + ")")
print("CONTRACT_COMMAND_NAMES=(" + " ".join(shlex.quote(str(name)) for name in commands.keys()) + ")")
for name, command in commands.items():
    safe_name = "".join(ch if ch.isalnum() or ch == "_" else "_" for ch in str(name))
    emit(f"CONTRACT_COMMAND__{safe_name}", str(command))
PY
)"

  if [ -n "$eval_output" ]; then
    eval "$eval_output"
  fi
}

run_contract_check() {
  local check_name="$1"
  local required_flag="$2"
  local command_string

  if check_is_skipped "$check_name"; then
    log_warning "Skipping contract check by env: ${check_name}"
    echo "ContractCheck(${check_name}): skipped via VERIFY_CHANGES_SKIP_CHECKS" >> "$RESULTS_FILE"
    append_check_result "$check_name" "skipped-by-parent"
    if [ "$required_flag" = true ]; then
      REQUIRED_CHECKS_EXECUTED+=("$check_name")
    else
      OPTIONAL_CHECKS_EXECUTED+=("$check_name")
    fi
    return 0
  fi

  command_string="$(get_contract_command "$check_name")"
  if [ -z "$command_string" ]; then
    log_error "Contract check '${check_name}' has no command"
    append_check_result "$check_name" "missing"
    if [ "$required_flag" = true ]; then
      REQUIRED_CHECKS_MISSING+=("$check_name")
      BUILD_FAILED=true
      VERIFICATION_PASSED=false
    else
      OPTIONAL_CHECKS_FAILED+=("$check_name")
    fi
    return 1
  fi

  log_info "Contract check: ${check_name}"
  echo "ContractCheck(${check_name}): ${command_string}" >> "$RESULTS_FILE"
  if bash -lc "$command_string" 2>&1 | tee -a "$RESULTS_FILE"; then
    log_success "Contract check passed: ${check_name}"
    append_check_result "$check_name" "passed"
    if [ "$required_flag" = true ]; then
      REQUIRED_CHECKS_EXECUTED+=("$check_name")
    else
      OPTIONAL_CHECKS_EXECUTED+=("$check_name")
    fi
    return 0
  fi

  append_check_result "$check_name" "failed"
  if [ "$required_flag" = true ]; then
    log_error "Contract check failed: ${check_name}"
    REQUIRED_CHECKS_EXECUTED+=("$check_name")
    BUILD_FAILED=true
    VERIFICATION_PASSED=false
  else
    log_warning "Optional contract check failed: ${check_name}"
    OPTIONAL_CHECKS_FAILED+=("$check_name")
  fi
  return 1
}

write_verdict_json() {
  local verdict="$1"
  local exit_code="$2"
  local finished_at="$3"
  local duration_ms="$4"

  RUN_ID="$RUN_ID" \
  FEATURE_NAME="$FEATURE_NAME" \
  OPERATING_MODE="$OPERATING_MODE" \
  STARTED_AT="$STARTED_AT" \
  FINISHED_AT="$finished_at" \
  DURATION_MS="$duration_ms" \
  VERDICT="$verdict" \
  EXIT_CODE="$exit_code" \
  RESULTS_FILE_PATH="$RESULTS_FILE" \
  VERDICT_FILE_PATH="$VERDICT_FILE" \
  CONTRACT_FILE_PATH="$CONTRACT_FILE" \
  CONTRACT_DETECTED_VALUE="$CONTRACT_DETECTED" \
  CONTRACT_APPLICABLE_VALUE="$CONTRACT_APPLICABLE" \
  CONTRACT_SCOPE_MATCHED_VALUE="$CONTRACT_SCOPE_MATCHED" \
  CONTRACT_SCOPE_REASON_VALUE="$CONTRACT_SCOPE_REASON" \
  VERIFICATION_MODE_VALUE="$VERIFICATION_MODE" \
  CONTRACT_FALLBACK_OUTSIDE_SCOPE_VALUE="$CONTRACT_FALLBACK_OUTSIDE_SCOPE" \
  EXTRA_HOOK_VALUE="$EXTRA_CHECKS_CMD" \
  TS_STATUS_VALUE="$TS_STATUS" \
  BUILD_STATUS_VALUE="$BUILD_STATUS" \
  TEST_STATUS_VALUE="$TEST_STATUS" \
  LINT_STATUS_VALUE="$LINT_STATUS" \
  EXTRA_STATUS_VALUE="$EXTRA_STATUS" \
  TEST_ENV_DETECTED_VALUE="$TEST_ENV_DETECTED" \
  EVIDENCE_FRESH_VALUE="$EVIDENCE_FRESH" \
  REQUIRED_DECLARED_LINES="$(join_lines "${CONTRACT_REQUIRED_CHECKS[@]}")" \
  REQUIRED_EXECUTED_LINES="$(join_lines "${REQUIRED_CHECKS_EXECUTED[@]}")" \
  REQUIRED_MISSING_LINES="$(join_lines "${REQUIRED_CHECKS_MISSING[@]}")" \
  OPTIONAL_DECLARED_LINES="$(join_lines "${CONTRACT_OPTIONAL_CHECKS[@]}")" \
  OPTIONAL_EXECUTED_LINES="$(join_lines "${OPTIONAL_CHECKS_EXECUTED[@]}")" \
  OPTIONAL_FAILED_LINES="$(join_lines "${OPTIONAL_CHECKS_FAILED[@]}")" \
  CONTRACT_CHECK_RESULTS_VALUE="$CONTRACT_CHECK_RESULTS_LINES" \
  CHANGED_FILES_LINES="$(join_lines "${CHANGED_FILES[@]}")" \
  python3 - <<'PY' > "$VERDICT_FILE"
import json
import os
import sys


def to_bool(value):
    return str(value).lower() == "true"


def split_lines(name):
    value = os.environ.get(name, "")
    return [line for line in value.splitlines() if line]


def parse_status_lines(name):
    result = {}
    for line in split_lines(name):
        key, _, value = line.partition("=")
        if key:
            result[key] = value
    return result


payload = {
    "runId": os.environ["RUN_ID"],
    "script": "verify-changes.sh",
    "feature": os.environ["FEATURE_NAME"],
    "operatingMode": os.environ["OPERATING_MODE"],
    "startedAt": os.environ["STARTED_AT"],
    "finishedAt": os.environ["FINISHED_AT"],
    "durationMs": int(os.environ["DURATION_MS"]),
    "verdict": os.environ["VERDICT"],
    "exitCode": int(os.environ["EXIT_CODE"]),
    "verificationMode": os.environ["VERIFICATION_MODE_VALUE"],
    "evidenceFresh": to_bool(os.environ["EVIDENCE_FRESH_VALUE"]),
    "changedFiles": split_lines("CHANGED_FILES_LINES"),
    "checks": {
        "typecheck": os.environ["TS_STATUS_VALUE"],
        "build": os.environ["BUILD_STATUS_VALUE"],
        "test": os.environ["TEST_STATUS_VALUE"],
        "lint": os.environ["LINT_STATUS_VALUE"],
        "extraChecks": os.environ["EXTRA_STATUS_VALUE"],
        "testEnvironmentDetected": to_bool(os.environ["TEST_ENV_DETECTED_VALUE"]),
        "contractChecks": parse_status_lines("CONTRACT_CHECK_RESULTS_VALUE"),
    },
    "requiredChecks": {
        "declared": split_lines("REQUIRED_DECLARED_LINES"),
        "executed": split_lines("REQUIRED_EXECUTED_LINES"),
        "missing": split_lines("REQUIRED_MISSING_LINES"),
    },
    "optionalChecks": {
        "declared": split_lines("OPTIONAL_DECLARED_LINES"),
        "executed": split_lines("OPTIONAL_EXECUTED_LINES"),
        "failed": split_lines("OPTIONAL_FAILED_LINES"),
    },
    "contract": {
        "path": os.environ["CONTRACT_FILE_PATH"],
        "detected": to_bool(os.environ["CONTRACT_DETECTED_VALUE"]),
        "applicable": to_bool(os.environ["CONTRACT_APPLICABLE_VALUE"]),
        "scopeMatched": to_bool(os.environ["CONTRACT_SCOPE_MATCHED_VALUE"]),
        "scopeReason": os.environ["CONTRACT_SCOPE_REASON_VALUE"],
        "verificationMode": os.environ["VERIFICATION_MODE_VALUE"],
        "fallbackOutsideScope": to_bool(os.environ["CONTRACT_FALLBACK_OUTSIDE_SCOPE_VALUE"]),
        "extraChecksCommand": os.environ["EXTRA_HOOK_VALUE"],
    },
    "artifacts": {
        "resultsFile": os.environ["RESULTS_FILE_PATH"],
        "verdictFile": os.environ["VERDICT_FILE_PATH"],
        "fresh": True,
    },
}

json.dump(payload, sys.stdout, indent=2)
sys.stdout.write("\n")
PY
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
CONTRACT_APPLICABLE=false
CONTRACT_SCOPE_MATCHED=false
CONTRACT_SCOPE_REASON="no_contract"
CONTRACT_FALLBACK_OUTSIDE_SCOPE=true
VERIFICATION_MODE="fallback"
TS_STATUS="not_run"
BUILD_STATUS="not_run"
TEST_STATUS="not_run"
LINT_STATUS="not_run"
EXTRA_STATUS="not_run"
EVIDENCE_FRESH=false
CONTRACT_CHECK_RESULTS_LINES=""
CHANGED_FILES=()
CONTRACT_COMMAND_NAMES=()
CONTRACT_REQUIRED_CHECKS=()
CONTRACT_OPTIONAL_CHECKS=()
REQUIRED_CHECKS_EXECUTED=()
REQUIRED_CHECKS_MISSING=()
OPTIONAL_CHECKS_EXECUTED=()
OPTIONAL_CHECKS_FAILED=()

collect_changed_files
load_contract_context

if [ -z "$EXTRA_CHECKS_CMD" ] && [ "$CONTRACT_APPLICABLE" = true ] && [ -n "$CONTRACT_HOOK_EXTRA_CHECKS" ]; then
  EXTRA_CHECKS_CMD="$CONTRACT_HOOK_EXTRA_CHECKS"
fi

echo ""
echo "======================================"
echo "  Generic Verification Harness"
echo "======================================"
echo ""

log_info "Target: $FEATURE_NAME"
log_info "Run ID: $RUN_ID"
log_info "Verification contract: $CONTRACT_FILE"
log_info "Verification mode: $VERIFICATION_MODE"
echo ""

echo "# Verification Results" > "$RESULTS_FILE"
echo "Date: $(date '+%Y-%m-%d %H:%M:%S')" >> "$RESULTS_FILE"
echo "Feature: $FEATURE_NAME" >> "$RESULTS_FILE"
echo "Run ID: $RUN_ID" >> "$RESULTS_FILE"
echo "Contract: $CONTRACT_FILE (detected=$CONTRACT_DETECTED, applicable=$CONTRACT_APPLICABLE, mode=$VERIFICATION_MODE, scopeReason=$CONTRACT_SCOPE_REASON)" >> "$RESULTS_FILE"
echo "" >> "$RESULTS_FILE"

if [ "$CONTRACT_APPLICABLE" = true ]; then
  log_info "Contract-defined required checks"
  if [ ${#CONTRACT_REQUIRED_CHECKS[@]} -eq 0 ]; then
    log_warning "No contract-defined required checks"
  else
    for check_name in "${CONTRACT_REQUIRED_CHECKS[@]}"; do
      [ -n "$check_name" ] || continue
      run_contract_check "$check_name" true || true
      echo "" >> "$RESULTS_FILE"
    done
  fi
else
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
fi

if [ "$CONTRACT_APPLICABLE" = true ] && [ ${#CONTRACT_OPTIONAL_CHECKS[@]} -gt 0 ]; then
  log_info "Contract-defined optional checks"
  for check_name in "${CONTRACT_OPTIONAL_CHECKS[@]}"; do
    [ -n "$check_name" ] || continue
    run_contract_check "$check_name" false || true
    echo "" >> "$RESULTS_FILE"
  done
fi

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
  if [ "$CONTRACT_APPLICABLE" = true ]; then
    if [ ${#CONTRACT_REQUIRED_CHECKS[@]} -gt 0 ] && [ ${#REQUIRED_CHECKS_EXECUTED[@]} -eq ${#CONTRACT_REQUIRED_CHECKS[@]} ] && [ ${#REQUIRED_CHECKS_MISSING[@]} -eq 0 ]; then
      EVIDENCE_FRESH=true
    elif [ ${#CONTRACT_REQUIRED_CHECKS[@]} -eq 0 ] && [ ${#CONTRACT_OPTIONAL_CHECKS[@]} -gt 0 ] && [ ${#OPTIONAL_CHECKS_EXECUTED[@]} -gt 0 ]; then
      EVIDENCE_FRESH=true
    fi
  elif [ "$TS_STATUS" = "passed" ] || [ "$BUILD_STATUS" = "passed" ] || [ "$TEST_STATUS" = "passed" ] || [ "$EXTRA_STATUS" = "passed" ]; then
    EVIDENCE_FRESH=true
  fi
fi

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
