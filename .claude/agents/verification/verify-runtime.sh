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

usage() {
  cat <<'EOF_USAGE'
Usage:
  verify-runtime.sh [--url <target-url>] [--browser-flow <name>] [--browser-only] [--browserctl <path>] [--e2e "<command>"] [--timeout <seconds>] [--no-auto-e2e]
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

  url_escaped="$(json_escape "$URL")"
  cmd_escaped="$(json_escape "$E2E_CMD")"
  source_escaped="$(json_escape "$E2E_SOURCE")"
  mode_escaped="$(json_escape "$OPERATING_MODE")"
  contract_file_escaped="$(json_escape "$CONTRACT_FILE")"
  browser_flow_escaped="$(json_escape "$BROWSER_FLOW")"
  browserctl_escaped="$(json_escape "$BROWSERCTL")"

  cat > "$VERDICT_FILE" <<JSON
{
  "runId": "${RUN_ID}",
  "script": "verify-runtime.sh",
  "operatingMode": "${mode_escaped}",
  "startedAt": "${STARTED_AT}",
  "finishedAt": "${finished_at}",
  "durationMs": ${duration_ms},
  "verdict": "${verdict}",
  "exitCode": ${exit_code},
  "contract": {
    "path": "${contract_file_escaped}",
    "detected": ${CONTRACT_DETECTED}
  },
  "checks": {
    "url": "${url_escaped}",
    "timeoutSec": ${TIMEOUT},
    "httpCode": "${HTTP_CODE}",
    "runtimeStatus": "${RUNTIME_STATUS}",
    "browserFlow": "${browser_flow_escaped}",
    "browserFlowStatus": "${BROWSER_FLOW_STATUS}",
    "browserOnly": ${BROWSER_ONLY},
    "browserctlPath": "${browserctl_escaped}",
    "e2eStatus": "${E2E_STATUS}",
    "e2eCommand": "${cmd_escaped}",
    "e2eSource": "${source_escaped}"
  },
  "artifacts": {
    "verdictFile": "${VERDICT_FILE}"
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

resolve_default_browserctl() {
  if command -v browserctl >/dev/null 2>&1; then
    command -v browserctl
  else
    printf '%s\n' ".claude/bin/browserctl"
  fi
}

run_browser_flow() {
  local start_rc
  local goto_rc

  echo ""
  log_info "Optional browser flow check"

  if [ -z "$BROWSER_FLOW" ]; then
    log_warning "No browser flow requested, skipping"
    BROWSER_FLOW_STATUS="skipped"
    return 0
  fi

  log_info "Browser flow: ${BROWSER_FLOW}"

  if [ ! -x "$BROWSERCTL" ]; then
    log_warning "browserctl not available at ${BROWSERCTL}"
    BROWSER_FLOW_STATUS="setup_gap"
    if [ "$BROWSER_ONLY" = true ]; then
      return 1
    fi
    return 0
  fi

  if "$BROWSERCTL" start >/dev/null 2>&1; then
    :
  else
    start_rc=$?
    if [ "$start_rc" -eq 64 ]; then
      log_warning "browserctl reported scaffold/setup gap on start"
      BROWSER_FLOW_STATUS="setup_gap"
      if [ "$BROWSER_ONLY" = true ]; then
        return 1
      fi
      return 0
    fi

    log_error "browserctl start failed"
    BROWSER_FLOW_STATUS="failed"
    return 1
  fi

  if "$BROWSERCTL" goto "$URL" >/dev/null 2>&1; then
    log_success "Browser flow bootstrap passed"
    BROWSER_FLOW_STATUS="passed"
    return 0
  fi

  goto_rc=$?
  if [ "$goto_rc" -eq 64 ]; then
    log_warning "browserctl reported scaffold/setup gap on goto"
    BROWSER_FLOW_STATUS="setup_gap"
    if [ "$BROWSER_ONLY" = true ]; then
      return 1
    fi
    return 0
  fi

  log_error "Browser flow failed during navigation bootstrap"
  BROWSER_FLOW_STATUS="failed"
  return 1
}

URL="${APP_BASE_URL:-http://localhost:3000}"
E2E_CMD="${RUNTIME_E2E_CMD:-}"
E2E_SOURCE=""
BROWSER_FLOW="${RUNTIME_BROWSER_FLOW:-}"
BROWSER_FLOW_SOURCE="explicit"
BROWSER_ONLY=false
BROWSERCTL="${BROWSERCTL_PATH:-$(resolve_default_browserctl)}"
BROWSER_DEFAULT_FLOW="${RUNTIME_DEFAULT_BROWSER_FLOW:-smoke}"
TIMEOUT=10
AUTO_E2E=true

RUN_ID="${HARNESS_RUN_ID:-verify-runtime-$(date +%Y%m%d-%H%M%S)}"
OPERATING_MODE="${HARNESS_OPERATING_MODE:-target_project}"
START_EPOCH="$(date +%s)"
STARTED_AT="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

CONTRACT_FILE="${VERIFICATION_CONTRACT_FILE:-.claude/verification.contract.yaml}"
CONTRACT_DETECTED=false
if [ -f "$CONTRACT_FILE" ]; then
  CONTRACT_DETECTED=true
fi

mkdir -p .claude
VERDICT_FILE="${HARNESS_VERDICT_FILE:-.claude/runtime-verdict-${RUN_ID}.json}"

RUNTIME_FAILED=false
FLOW_FAILED=false
E2E_FAILED=false
HTTP_CODE="000"
RUNTIME_STATUS="not_run"
BROWSER_FLOW_STATUS="not_run"
E2E_STATUS="not_run"

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

echo ""
echo "======================================"
echo "  Runtime Verification Harness"
echo "======================================"
echo ""

log_info "Run ID: ${RUN_ID}"
log_info "Target URL: ${URL}"
log_info "Timeout: ${TIMEOUT}s"
log_info "Verification contract: ${CONTRACT_FILE}"
if [ -n "$BROWSER_FLOW" ]; then
  log_info "Browser flow: ${BROWSER_FLOW}"
  log_info "Browser flow source: ${BROWSER_FLOW_SOURCE}"
  log_info "Browser only mode: ${BROWSER_ONLY}"
  log_info "browserctl path: ${BROWSERCTL}"
fi
echo ""

log_info "URL health check"
HTTP_CODE="$(curl -L -sS -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "$URL" 2>/dev/null || true)"
if [[ "$HTTP_CODE" =~ ^[23][0-9][0-9]$ ]]; then
  log_success "URL reachable (HTTP ${HTTP_CODE})"
  RUNTIME_STATUS="passed"
else
  log_error "URL check failed (HTTP ${HTTP_CODE})"
  RUNTIME_FAILED=true
  RUNTIME_STATUS="failed"
fi
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

if [ "$RUNTIME_FAILED" = true ]; then
  finalize_and_exit 1 "failed"
fi

if [ "$FLOW_FAILED" = true ]; then
  finalize_and_exit 3 "failed"
fi

if [ "$E2E_FAILED" = true ]; then
  finalize_and_exit 2 "failed"
fi

log_success "Runtime verification passed"
finalize_and_exit 0 "passed"
