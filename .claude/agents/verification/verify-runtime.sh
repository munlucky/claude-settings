#!/usr/bin/env bash

# Runtime verification script
# 목적: 웹 런타임(URL) 헬스체크 + 선택적 E2E 실행
# 종료 코드:
#   0: 성공
#   1: 런타임(URL) 검증 실패
#   2: E2E 테스트 실패

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

usage() {
  cat <<'EOF'
Usage:
  verify-runtime.sh [--url <target-url>] [--e2e "<command>"] [--timeout <seconds>]

Examples:
  verify-runtime.sh --url http://localhost:3000
  verify-runtime.sh --url https://staging.example.com --e2e "npm run test:e2e"
EOF
}

URL="${APP_BASE_URL:-http://localhost:3000}"
E2E_CMD=""
TIMEOUT=10

while [ $# -gt 0 ]; do
  case "$1" in
    --url)
      if [ $# -lt 2 ]; then
        log_error "--url requires a value"
        usage
        exit 64
      fi
      URL="$2"
      shift 2
      ;;
    --url=*)
      URL="${1#*=}"
      shift
      ;;
    --e2e)
      if [ $# -lt 2 ]; then
        log_error "--e2e requires a value"
        usage
        exit 64
      fi
      E2E_CMD="$2"
      shift 2
      ;;
    --e2e=*)
      E2E_CMD="${1#*=}"
      shift
      ;;
    --timeout)
      if [ $# -lt 2 ]; then
        log_error "--timeout requires a value"
        usage
        exit 64
      fi
      TIMEOUT="$2"
      shift 2
      ;;
    --timeout=*)
      TIMEOUT="${1#*=}"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      log_error "Unknown argument: $1"
      usage
      exit 64
      ;;
  esac
done

RUNTIME_FAILED=false
E2E_FAILED=false

echo ""
echo "======================================"
echo "  Runtime Verification"
echo "======================================"
echo ""

log_info "Target URL: ${URL}"
log_info "Timeout: ${TIMEOUT}s"
echo ""

log_info "1/2 URL health check"
HTTP_CODE="$(curl -L -sS -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "$URL" 2>/dev/null || true)"
if [ -z "$HTTP_CODE" ]; then
  HTTP_CODE="000"
fi
if [[ "$HTTP_CODE" =~ ^[23][0-9][0-9]$ ]]; then
  log_success "URL reachable (HTTP ${HTTP_CODE})"
else
  log_error "URL check failed (HTTP ${HTTP_CODE})"
  RUNTIME_FAILED=true
fi
echo ""

log_info "2/2 Optional E2E check"
if [ -n "$E2E_CMD" ]; then
  log_info "Running: ${E2E_CMD}"
  if bash -lc "$E2E_CMD"; then
    log_success "E2E command passed"
  else
    log_error "E2E command failed"
    E2E_FAILED=true
  fi
else
  log_warning "No E2E command provided, skipping"
fi
echo ""

if [ "$RUNTIME_FAILED" = true ]; then
  exit 1
fi

if [ "$E2E_FAILED" = true ]; then
  exit 2
fi

log_success "Runtime verification passed"
exit 0
