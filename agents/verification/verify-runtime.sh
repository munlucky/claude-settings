#!/usr/bin/env bash

# Generic runtime verification harness.
# Purpose:
#   - verify runtime reachability
#   - optionally run E2E commands
#   - emit a JSON verdict artifact compatible with the verification contract

set -u

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
  echo -e "${BLUE}[INFO] $1${NC}"
}

log_success() {
  echo -e "${GREEN}[PASS] $1${NC}"
}

log_warning() {
  echo -e "${YELLOW}[WARN] $1${NC}"
}

log_error() {
  echo -e "${RED}[FAIL] $1${NC}"
}

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

join_lines() {
  printf '%s\n' "$@" | sed '/^$/d'
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
  CONTRACT_RUNTIME_URL=""
  CONTRACT_RUNTIME_E2E=""
  CONTRACT_REQUIRED_CHECKS=()
  CONTRACT_OPTIONAL_CHECKS=()

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
runtime = contract.get("runtime", {}) if isinstance(contract.get("runtime"), dict) else {}

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
runtime_url = str(runtime.get("url", "")) if runtime.get("url") is not None else ""
runtime_e2e = str(runtime.get("e2eCommand", "")) if runtime.get("e2eCommand") is not None else ""
runtime_relevant = bool(runtime_url or runtime_e2e or "runtime" in required_checks or "runtime" in optional_checks)
applicable = scope_matched and runtime_relevant

mode = "contract" if applicable else ("workspace" if fallback_outside_scope else "fallback")
if not scope_matched:
    reason = "scope_mismatch"
elif not runtime_relevant:
    reason = "no_runtime_contract"
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
emit("CONTRACT_RUNTIME_URL", runtime_url)
emit("CONTRACT_RUNTIME_E2E", runtime_e2e)
print("CONTRACT_REQUIRED_CHECKS=(" + " ".join(shlex.quote(item) for item in required_checks) + ")")
print("CONTRACT_OPTIONAL_CHECKS=(" + " ".join(shlex.quote(item) for item in optional_checks) + ")")
PY
)"

  if [ -n "$eval_output" ]; then
    eval "$eval_output"
  fi
}

usage() {
  cat <<'EOF_USAGE'
Usage:
  verify-runtime.sh [--url <target-url>] [--browser-flow <name>] [--browser-flow-verdict <path>] [--browser-only] [--browserctl <path>] [--e2e "<command>"] [--timeout <seconds>] [--no-auto-e2e]
EOF_USAGE
}

write_verdict_json() {
  local verdict="$1"
  local exit_code="$2"
  local finished_at="$3"
  local duration_ms="$4"

  local url_escaped
  local cmd_escaped
  local source_escaped
  local mode_escaped
  local contract_file_escaped
  local browser_flow_escaped
  local browserctl_escaped
  RUN_ID="$RUN_ID" \
  OPERATING_MODE="$OPERATING_MODE" \
  STARTED_AT="$STARTED_AT" \
  FINISHED_AT="$finished_at" \
  DURATION_MS="$duration_ms" \
  VERDICT="$verdict" \
  EXIT_CODE="$exit_code" \
  CONTRACT_FILE_PATH="$CONTRACT_FILE" \
  CONTRACT_DETECTED_VALUE="$CONTRACT_DETECTED" \
  CONTRACT_APPLICABLE_VALUE="$CONTRACT_APPLICABLE" \
  CONTRACT_SCOPE_MATCHED_VALUE="$CONTRACT_SCOPE_MATCHED" \
  CONTRACT_SCOPE_REASON_VALUE="$CONTRACT_SCOPE_REASON" \
  CONTRACT_FALLBACK_OUTSIDE_SCOPE_VALUE="$CONTRACT_FALLBACK_OUTSIDE_SCOPE" \
  VERIFICATION_MODE_VALUE="$VERIFICATION_MODE" \
  URL_VALUE="$URL" \
  TIMEOUT_VALUE="$TIMEOUT" \
  HTTP_CODE_VALUE="$HTTP_CODE" \
  RUNTIME_STATUS_VALUE="$RUNTIME_STATUS" \
  BROWSER_FLOW_VALUE="$BROWSER_FLOW" \
  BROWSER_FLOW_STATUS_VALUE="$BROWSER_FLOW_STATUS" \
  BROWSER_FLOW_VERDICT_FILE_VALUE="$BROWSER_FLOW_VERDICT_FILE" \
  BROWSER_FLOW_VISUAL_DIFF_VERDICT_FILE_VALUE="$BROWSER_FLOW_VISUAL_DIFF_VERDICT_FILE" \
  BROWSER_FLOW_SETUP_GAP_REASON_VALUE="${BROWSER_FLOW_SETUP_GAP_REASON:-}" \
  BROWSER_FLOW_EXPECTED_RUNNER_VALUE="${BROWSER_FLOW_EXPECTED_RUNNER:-}" \
  BROWSER_ONLY_VALUE="$BROWSER_ONLY" \
  BROWSERCTL_VALUE="$BROWSERCTL" \
  E2E_STATUS_VALUE="$E2E_STATUS" \
  E2E_CMD_VALUE="$E2E_CMD" \
  E2E_SOURCE_VALUE="$E2E_SOURCE" \
  VERDICT_FILE_PATH="$VERDICT_FILE" \
  EVIDENCE_FRESH_VALUE="$EVIDENCE_FRESH" \
  REQUIRED_DECLARED_LINES="$(join_lines "${REQUIRED_CHECKS_DECLARED[@]-}")" \
  REQUIRED_EXECUTED_LINES="$(join_lines "${REQUIRED_CHECKS_EXECUTED[@]-}")" \
  REQUIRED_MISSING_LINES="$(join_lines "${REQUIRED_CHECKS_MISSING[@]-}")" \
  OPTIONAL_DECLARED_LINES="$(join_lines "${OPTIONAL_CHECKS_DECLARED[@]-}")" \
  OPTIONAL_EXECUTED_LINES="$(join_lines "${OPTIONAL_CHECKS_EXECUTED[@]-}")" \
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


payload = {
    "runId": os.environ["RUN_ID"],
    "script": "verify-runtime.sh",
    "operatingMode": os.environ["OPERATING_MODE"],
    "startedAt": os.environ["STARTED_AT"],
    "finishedAt": os.environ["FINISHED_AT"],
    "durationMs": int(os.environ["DURATION_MS"]),
    "verdict": os.environ["VERDICT"],
    "exitCode": int(os.environ["EXIT_CODE"]),
    "verificationMode": os.environ["VERIFICATION_MODE_VALUE"],
    "evidenceFresh": to_bool(os.environ["EVIDENCE_FRESH_VALUE"]),
    "changedFiles": split_lines("CHANGED_FILES_LINES"),
    "requiredChecks": {
        "declared": split_lines("REQUIRED_DECLARED_LINES"),
        "executed": split_lines("REQUIRED_EXECUTED_LINES"),
        "missing": split_lines("REQUIRED_MISSING_LINES"),
    },
    "optionalChecks": {
        "declared": split_lines("OPTIONAL_DECLARED_LINES"),
        "executed": split_lines("OPTIONAL_EXECUTED_LINES"),
        "failed": [],
    },
    "contract": {
        "path": os.environ["CONTRACT_FILE_PATH"],
        "detected": to_bool(os.environ["CONTRACT_DETECTED_VALUE"]),
        "applicable": to_bool(os.environ["CONTRACT_APPLICABLE_VALUE"]),
        "scopeMatched": to_bool(os.environ["CONTRACT_SCOPE_MATCHED_VALUE"]),
        "scopeReason": os.environ["CONTRACT_SCOPE_REASON_VALUE"],
        "verificationMode": os.environ["VERIFICATION_MODE_VALUE"],
        "fallbackOutsideScope": to_bool(os.environ["CONTRACT_FALLBACK_OUTSIDE_SCOPE_VALUE"]),
    },
    "checks": {
        "url": os.environ["URL_VALUE"],
        "timeoutSec": int(os.environ["TIMEOUT_VALUE"]),
        "httpCode": os.environ["HTTP_CODE_VALUE"],
        "runtimeStatus": os.environ["RUNTIME_STATUS_VALUE"],
        "browserFlow": os.environ["BROWSER_FLOW_VALUE"],
        "browserFlowStatus": os.environ["BROWSER_FLOW_STATUS_VALUE"],
        "browserFlowVerdictFile": os.environ["BROWSER_FLOW_VERDICT_FILE_VALUE"],
        "browserFlowVisualDiffVerdictFile": os.environ["BROWSER_FLOW_VISUAL_DIFF_VERDICT_FILE_VALUE"],
        "browserFlowSetupGapReason": os.environ["BROWSER_FLOW_SETUP_GAP_REASON_VALUE"],
        "browserFlowExpectedRunner": os.environ["BROWSER_FLOW_EXPECTED_RUNNER_VALUE"],
        "browserOnly": to_bool(os.environ["BROWSER_ONLY_VALUE"]),
        "browserctlPath": os.environ["BROWSERCTL_VALUE"],
        "e2eStatus": os.environ["E2E_STATUS_VALUE"],
        "e2eCommand": os.environ["E2E_CMD_VALUE"],
        "e2eSource": os.environ["E2E_SOURCE_VALUE"],
    },
    "artifacts": {
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

resolve_moonshot_relay_home() {
  if [ -n "${MOONSHOT_RELAY_HOME:-}" ]; then
    printf '%s\n' "$MOONSHOT_RELAY_HOME"
  elif [ -n "${HOME:-}" ]; then
    printf '%s\n' "$HOME/.moonshot-relay"
  else
    printf '%s\n' ".moonshot-relay"
  fi
}

resolve_moonshot_relay_path() {
  local home
  home="$(resolve_moonshot_relay_home)"
  printf '%s\n' "$home/$1"
}

resolve_default_browserctl() {
  local runtime_browserctl
  local legacy_browserctl

  runtime_browserctl="$(resolve_moonshot_relay_path "bin/browserctl")"
  legacy_browserctl="${CLAUDE_HOME:-.claude}/bin/browserctl"

  if [ -x "$runtime_browserctl" ]; then
    printf '%s\n' "$runtime_browserctl"
  elif command -v browserctl >/dev/null 2>&1; then
    command -v browserctl
  elif [ -x "$legacy_browserctl" ]; then
    printf '%s\n' "$legacy_browserctl"
  else
    printf '%s\n' "$runtime_browserctl"
  fi
}

run_browser_flow() {
  local flow_output
  local flow_rc
  local verdict_status

  echo ""
  log_info "Optional browser flow check"

  if [ -z "$BROWSER_FLOW" ]; then
    log_warning "No browser flow requested, skipping"
    BROWSER_FLOW_STATUS="skipped"
    return 0
  fi

  log_info "Browser flow: ${BROWSER_FLOW}"

  if [ -n "$BROWSER_FLOW_VERDICT_OVERRIDE" ]; then
    if [ ! -f "$BROWSER_FLOW_VERDICT_OVERRIDE" ]; then
      log_warning "browser flow verdict override not found: ${BROWSER_FLOW_VERDICT_OVERRIDE}"
      BROWSER_FLOW_STATUS="setup_gap"
      if [ "$BROWSER_ONLY" = true ]; then
        return 1
      fi
      return 0
    fi

    verdict_status="$(python3 - "$BROWSER_FLOW_VERDICT_OVERRIDE" "$BROWSER_FLOW" <<'PY'
import json
import sys

path, expected_flow = sys.argv[1], sys.argv[2]
with open(path, "r", encoding="utf-8") as handle:
    payload = json.load(handle)
if payload.get("flowName") != expected_flow:
    print("flow_mismatch")
elif payload.get("status") == "passed":
    print("passed")
else:
    print(str(payload.get("status") or "unknown"))
PY
)"
    BROWSER_FLOW_VERDICT_FILE="$BROWSER_FLOW_VERDICT_OVERRIDE"
    BROWSER_FLOW_VISUAL_DIFF_VERDICT_FILE="$(python3 - "$BROWSER_FLOW_VERDICT_FILE" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    payload = json.load(handle)
print(payload.get("artifacts", {}).get("visualDiff", ""))
PY
)"
    if [ "$verdict_status" = "passed" ]; then
      log_success "Browser flow verdict override passed"
      [ -n "$BROWSER_FLOW_VISUAL_DIFF_VERDICT_FILE" ] && log_info "Visual diff verdict: ${BROWSER_FLOW_VISUAL_DIFF_VERDICT_FILE}"
      BROWSER_FLOW_STATUS="passed"
      return 0
    fi
    log_warning "Browser flow verdict override did not pass (${verdict_status})"
    BROWSER_FLOW_STATUS="failed"
    return 1
  fi

  if [ ! -x "$BROWSERCTL" ]; then
    log_warning "browserctl not available at ${BROWSERCTL}"
    BROWSER_FLOW_STATUS="setup_gap"
    BROWSER_FLOW_SETUP_GAP_REASON="browserctl_unavailable"
    if [ "$BROWSER_ONLY" = true ]; then
      return 1
    fi
    return 0
  fi

  if [ ! -f "$BROWSER_FLOW_RUNNER" ]; then
    log_warning "browser flow runner not available at ${BROWSER_FLOW_RUNNER}"
    BROWSER_FLOW_STATUS="setup_gap"
    BROWSER_FLOW_SETUP_GAP_REASON="browser_flow_runner_unavailable"
    BROWSER_FLOW_EXPECTED_RUNNER="$BROWSER_FLOW_RUNNER"
    if [ "$BROWSER_ONLY" = true ]; then
      return 1
    fi
    return 0
  fi

  flow_output="$(node "$BROWSER_FLOW_RUNNER" \
    --flow "$BROWSER_FLOW" \
    --url "$URL" \
    --browserctl "$BROWSERCTL" \
    --run-id "${RUN_ID}-${BROWSER_FLOW}" 2>&1)"
  flow_rc=$?
  BROWSER_FLOW_VERDICT_FILE="$(printf '%s\n' "$flow_output" | grep '^\.claude/browser-flow-verdict-' | tail -1 || true)"
  if [ -n "$BROWSER_FLOW_VERDICT_FILE" ] && [ -f "$BROWSER_FLOW_VERDICT_FILE" ]; then
    BROWSER_FLOW_VISUAL_DIFF_VERDICT_FILE="$(python3 - "$BROWSER_FLOW_VERDICT_FILE" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    payload = json.load(handle)
print(payload.get("artifacts", {}).get("visualDiff", ""))
PY
)"
  fi

  if [ "$flow_rc" -eq 0 ]; then
    log_success "Browser flow runner passed"
    [ -n "$BROWSER_FLOW_VISUAL_DIFF_VERDICT_FILE" ] && log_info "Visual diff verdict: ${BROWSER_FLOW_VISUAL_DIFF_VERDICT_FILE}"
    BROWSER_FLOW_STATUS="passed"
    return 0
  fi

  if [ "$flow_rc" -eq 64 ]; then
    log_warning "Browser flow runner reported setup gap"
    [ -n "$BROWSER_FLOW_VERDICT_FILE" ] && log_info "Browser flow verdict: ${BROWSER_FLOW_VERDICT_FILE}"
    [ -n "$BROWSER_FLOW_VISUAL_DIFF_VERDICT_FILE" ] && log_info "Visual diff verdict: ${BROWSER_FLOW_VISUAL_DIFF_VERDICT_FILE}"
    BROWSER_FLOW_STATUS="setup_gap"
    if [ "$BROWSER_ONLY" = true ]; then
      return 1
    fi
    return 0
  fi

  log_error "Browser flow runner failed"
  [ -n "$BROWSER_FLOW_VERDICT_FILE" ] && log_info "Browser flow verdict: ${BROWSER_FLOW_VERDICT_FILE}"
  [ -n "$BROWSER_FLOW_VISUAL_DIFF_VERDICT_FILE" ] && log_info "Visual diff verdict: ${BROWSER_FLOW_VISUAL_DIFF_VERDICT_FILE}"
  BROWSER_FLOW_STATUS="failed"
  return 1
}

run_url_health_check() {
  log_info "URL health check"

  case "$URL" in
    file://*)
      local target_path
      target_path="${URL#file://}"
      if [ -f "$target_path" ]; then
        HTTP_CODE="LOCAL_FILE"
        log_success "Local file reachable (${target_path})"
        RUNTIME_STATUS="passed"
      else
        HTTP_CODE="LOCAL_FILE_MISSING"
        log_error "Local file check failed (${target_path})"
        RUNTIME_FAILED=true
        RUNTIME_STATUS="failed"
      fi
      return
      ;;
    data:*)
      HTTP_CODE="LOCAL_DATA"
      log_success "Data URL accepted for local self-test"
      RUNTIME_STATUS="passed"
      return
      ;;
  esac

  HTTP_CODE="$(curl -L -sS -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "$URL" 2>/dev/null || true)"
  if [[ "$HTTP_CODE" =~ ^[23][0-9][0-9]$ ]]; then
    log_success "URL reachable (HTTP ${HTTP_CODE})"
    RUNTIME_STATUS="passed"
  else
    log_error "URL check failed (HTTP ${HTTP_CODE})"
    RUNTIME_FAILED=true
    RUNTIME_STATUS="failed"
  fi
}

URL="${APP_BASE_URL:-http://localhost:3000}"
E2E_CMD="${RUNTIME_E2E_CMD:-}"
E2E_SOURCE=""
E2E_SOURCE="${E2E_SOURCE:-}"
BROWSER_FLOW="${RUNTIME_BROWSER_FLOW:-}"
BROWSER_FLOW_VERDICT_FILE=""
BROWSER_FLOW_VISUAL_DIFF_VERDICT_FILE=""
BROWSER_FLOW_VERDICT_OVERRIDE="${RUNTIME_BROWSER_FLOW_VERDICT:-}"
BROWSER_FLOW_SOURCE="explicit"
BROWSER_ONLY=false
BROWSERCTL="${BROWSERCTL_PATH:-$(resolve_default_browserctl)}"
BROWSER_FLOW_RUNNER="${BROWSER_FLOW_RUNNER_PATH:-$(resolve_moonshot_relay_path "scripts/browser-flow-runner.mjs")}"
if [ ! -f "$BROWSER_FLOW_RUNNER" ] && [ -f "${CLAUDE_HOME:-.claude}/scripts/browser-flow-runner.mjs" ]; then
  BROWSER_FLOW_RUNNER="${CLAUDE_HOME:-.claude}/scripts/browser-flow-runner.mjs"
fi
BROWSER_DEFAULT_FLOW="${RUNTIME_DEFAULT_BROWSER_FLOW:-smoke}"
TIMEOUT="${RUNTIME_TIMEOUT_SECONDS:-20}"
AUTO_E2E=true

RUN_ID="${HARNESS_RUN_ID:-verify-runtime-$(date +%Y%m%d-%H%M%S)}"
OPERATING_MODE="${HARNESS_OPERATING_MODE:-target_project}"
START_EPOCH="$(date +%s)"
STARTED_AT="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

CONTRACT_FILE="${VERIFICATION_CONTRACT_FILE:-.claude/verification.contract.yaml}"
CONTRACT_DETECTED=false
CONTRACT_APPLICABLE=false
CONTRACT_SCOPE_MATCHED=false
CONTRACT_SCOPE_REASON="no_contract"
CONTRACT_FALLBACK_OUTSIDE_SCOPE=true
VERIFICATION_MODE="fallback"
CONTRACT_RUNTIME_URL=""
CONTRACT_RUNTIME_E2E=""
CONTRACT_REQUIRED_CHECKS=()
CONTRACT_OPTIONAL_CHECKS=()

mkdir -p .claude
VERDICT_FILE="${HARNESS_VERDICT_FILE:-.claude/runtime-verdict-${RUN_ID}.json}"

RUNTIME_FAILED=false
FLOW_FAILED=false
E2E_FAILED=false
HTTP_CODE="000"
RUNTIME_STATUS="not_run"
BROWSER_FLOW_STATUS="not_run"
BROWSER_FLOW_SETUP_GAP_REASON=""
BROWSER_FLOW_EXPECTED_RUNNER=""
E2E_STATUS="not_run"
EVIDENCE_FRESH=false
REQUIRED_CHECKS_DECLARED=()
REQUIRED_CHECKS_EXECUTED=()
REQUIRED_CHECKS_MISSING=()
OPTIONAL_CHECKS_DECLARED=()
OPTIONAL_CHECKS_EXECUTED=()
CHANGED_FILES=()

collect_changed_files
load_contract_context

while [ $# -gt 0 ]; do
  case "$1" in
    --url)
      URL="$2"
      shift 2
      ;;
    --url=*)
      URL="${1#*=}"
      shift
      ;;
    --e2e)
      E2E_CMD="$2"
      E2E_SOURCE="cli"
      shift 2
      ;;
    --e2e=*)
      E2E_CMD="${1#*=}"
      E2E_SOURCE="cli"
      shift
      ;;
    --browser-flow)
      BROWSER_FLOW="$2"
      shift 2
      ;;
    --browser-flow=*)
      BROWSER_FLOW="${1#*=}"
      shift
      ;;
    --browser-flow-verdict)
      BROWSER_FLOW_VERDICT_OVERRIDE="$2"
      shift 2
      ;;
    --browser-flow-verdict=*)
      BROWSER_FLOW_VERDICT_OVERRIDE="${1#*=}"
      shift
      ;;
    --browser-only)
      BROWSER_ONLY=true
      shift
      ;;
    --browserctl)
      BROWSERCTL="$2"
      shift 2
      ;;
    --browserctl=*)
      BROWSERCTL="${1#*=}"
      shift
      ;;
    --timeout)
      TIMEOUT="$2"
      shift 2
      ;;
    --timeout=*)
      TIMEOUT="${1#*=}"
      shift
      ;;
    --no-auto-e2e)
      AUTO_E2E=false
      shift
      ;;
    -h|--help)
      usage
      finalize_and_exit 0 "passed"
      ;;
    *)
      log_error "Unknown argument: $1"
      usage
      finalize_and_exit 64 "failed"
      ;;
    esac
done

if [ -z "${APP_BASE_URL:-}" ] && [ "$URL" = "http://localhost:3000" ] && [ -n "$CONTRACT_RUNTIME_URL" ]; then
  URL="$CONTRACT_RUNTIME_URL"
fi

if [ -z "$E2E_CMD" ] && [ -n "$CONTRACT_RUNTIME_E2E" ]; then
  E2E_CMD="$CONTRACT_RUNTIME_E2E"
  E2E_SOURCE="contract:runtime.e2eCommand"
fi

if [ "$BROWSER_ONLY" = true ] && [ -z "$BROWSER_FLOW" ]; then
  BROWSER_FLOW="basic"
  BROWSER_FLOW_SOURCE="browser_only_default"
fi

if [ "$BROWSER_ONLY" = true ]; then
  AUTO_E2E=false
  E2E_CMD=""
  E2E_SOURCE="browser-only"
fi

if [ -n "$E2E_CMD" ] && [ -z "$E2E_SOURCE" ]; then
  E2E_SOURCE="env:RUNTIME_E2E_CMD"
fi

if [ -z "$E2E_CMD" ] && [ "$AUTO_E2E" = true ]; then
  if has_npm_script "test:e2e:agent-browser"; then
    E2E_CMD="npm run test:e2e:agent-browser"
    E2E_SOURCE="auto:test:e2e:agent-browser"
  elif has_npm_script "test:e2e"; then
    E2E_CMD="npm run test:e2e"
    E2E_SOURCE="auto:test:e2e"
  fi
fi

if [ -z "$BROWSER_FLOW" ] && [ "$BROWSER_ONLY" = false ] && [ -x "$BROWSERCTL" ]; then
  if [ -n "$E2E_CMD" ] || [ "$AUTO_E2E" = true ]; then
    BROWSER_FLOW="$BROWSER_DEFAULT_FLOW"
    BROWSER_FLOW_SOURCE="auto:default"
  fi
fi

if [ "$CONTRACT_APPLICABLE" = true ]; then
  case " ${CONTRACT_REQUIRED_CHECKS[*]} " in
    *" runtime "*) REQUIRED_CHECKS_DECLARED+=("runtime") ;;
  esac
  case " ${CONTRACT_OPTIONAL_CHECKS[*]} " in
    *" runtime "*) OPTIONAL_CHECKS_DECLARED+=("runtime") ;;
  esac
fi

echo ""
echo "======================================"
echo "  Runtime Verification Harness"
echo "======================================"
echo ""

log_info "Run ID: ${RUN_ID}"
log_info "Target URL: ${URL}"
log_info "Timeout: ${TIMEOUT}s"
log_info "Verification contract: ${CONTRACT_FILE}"
log_info "Verification mode: ${VERIFICATION_MODE}"
if [ -n "$BROWSER_FLOW" ]; then
  log_info "Browser flow: ${BROWSER_FLOW}"
  log_info "Browser flow source: ${BROWSER_FLOW_SOURCE}"
  log_info "Browser only mode: ${BROWSER_ONLY}"
  log_info "browserctl path: ${BROWSERCTL}"
fi
echo ""

run_url_health_check
echo ""

if run_browser_flow; then
  :
else
  FLOW_FAILED=true
fi
echo ""

log_info "Optional E2E check"
if [ "$BROWSER_ONLY" = true ]; then
  log_warning "Browser-only mode enabled, skipping E2E command"
  E2E_STATUS="skipped"
elif [ -n "$E2E_CMD" ]; then
  log_info "Running: ${E2E_CMD}"
  if bash -lc "$E2E_CMD"; then
    log_success "E2E command passed"
    E2E_STATUS="passed"
  else
    log_error "E2E command failed"
    E2E_FAILED=true
    E2E_STATUS="failed"
  fi
else
  log_warning "No E2E command resolved, skipping"
  E2E_STATUS="skipped"
fi
echo ""

if [ "$RUNTIME_STATUS" != "not_run" ] || [ "$BROWSER_FLOW_STATUS" != "not_run" ] || [ "$E2E_STATUS" != "not_run" ]; then
  if [ ${#REQUIRED_CHECKS_DECLARED[@]} -gt 0 ]; then
    REQUIRED_CHECKS_EXECUTED+=("runtime")
  elif [ ${#OPTIONAL_CHECKS_DECLARED[@]} -gt 0 ]; then
    OPTIONAL_CHECKS_EXECUTED+=("runtime")
  fi
fi

if [ "$RUNTIME_FAILED" = true ]; then
  finalize_and_exit 1 "failed"
fi

if [ "$FLOW_FAILED" = true ]; then
  finalize_and_exit 3 "failed"
fi

if [ "$E2E_FAILED" = true ]; then
  finalize_and_exit 2 "failed"
fi

if [ "$VERIFICATION_MODE" = "contract" ] && [ ${#REQUIRED_CHECKS_DECLARED[@]} -gt 0 ] && [ ${#REQUIRED_CHECKS_EXECUTED[@]} -eq 0 ]; then
  REQUIRED_CHECKS_MISSING+=("runtime")
fi

if [ ${#REQUIRED_CHECKS_MISSING[@]} -eq 0 ] && [ "$RUNTIME_STATUS" = "passed" ]; then
  EVIDENCE_FRESH=true
fi

log_success "Runtime verification passed"
finalize_and_exit 0 "passed"
