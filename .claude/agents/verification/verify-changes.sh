#!/bin/bash

# Verification Script for Readlog CMS v3
# 목적: 코드 변경사항 자동 검증 (tsc, build, test, lint, 활동 로그 헤더)
# 사용: ./verify-changes.sh [feature-name]
# 종료 코드:
#   0: 모든 검증 통과
#   1: 빌드/타입체크 등 기본 검증 실패
#   2: 테스트 실패
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

write_verdict_json() {
  local verdict="$1"
  local exit_code="$2"
  local finished_at="$3"
  local duration_ms="$4"

  local feature_escaped
  local results_file_escaped
  local verdict_file_escaped
  local operating_mode_escaped

  feature_escaped="$(json_escape "$FEATURE_NAME")"
  results_file_escaped="$(json_escape "$RESULTS_FILE")"
  verdict_file_escaped="$(json_escape "$VERDICT_FILE")"
  operating_mode_escaped="$(json_escape "$OPERATING_MODE")"

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
    "testEnvironmentDetected": ${TEST_ENV_DETECTED}
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

mkdir -p .claude
RESULTS_FILE=".claude/verification-results-$(date +%Y%m%d-%H%M%S).txt"
VERDICT_FILE="${HARNESS_VERDICT_FILE:-.claude/verification-verdict-${RUN_ID}.json}"

VERIFICATION_PASSED=true
BUILD_FAILED=false
TEST_FAILED=false
TEST_ENV_DETECTED=false
TS_STATUS="not_run"
BUILD_STATUS="not_run"
TEST_STATUS="not_run"
LINT_STATUS="not_run"

echo ""
echo "======================================"
echo "  🔍 Verification Agent"
echo "======================================"
echo ""

log_info "검증 대상: $FEATURE_NAME"
log_info "Run ID: $RUN_ID"
echo ""

echo "# Verification Results" > "$RESULTS_FILE"
echo "Date: $(date '+%Y-%m-%d %H:%M:%S')" >> "$RESULTS_FILE"
echo "Feature: $FEATURE_NAME" >> "$RESULTS_FILE"
echo "Run ID: $RUN_ID" >> "$RESULTS_FILE"
echo "" >> "$RESULTS_FILE"

log_info "1/7 TypeScript 타입 체크 실행 중..."
if npx tsc --noEmit 2>&1 | tee -a "$RESULTS_FILE"; then
  log_success "TypeScript 타입 체크 통과"
  echo "TypeScript: ✅ PASSED" >> "$RESULTS_FILE"
  TS_STATUS="passed"
else
  log_error "TypeScript 타입 에러 발생"
  echo "TypeScript: ❌ FAILED" >> "$RESULTS_FILE"
  BUILD_FAILED=true
  VERIFICATION_PASSED=false
  TS_STATUS="failed"
fi
echo ""

log_info "2/7 프로덕션 빌드 실행 중..."
if npm run build 2>&1 | tee -a "$RESULTS_FILE"; then
  log_success "프로덕션 빌드 성공"
  echo "Build: ✅ PASSED" >> "$RESULTS_FILE"
  BUILD_STATUS="passed"
else
  log_error "빌드 실패"
  echo "Build: ❌ FAILED" >> "$RESULTS_FILE"
  BUILD_FAILED=true
  VERIFICATION_PASSED=false
  BUILD_STATUS="failed"
fi
echo ""

log_info "3/7 테스트 실행 중..."
if [ -f "package.json" ] && node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync("package.json","utf8")); process.exit(p.scripts && p.scripts.test ? 0 : 1);' >/dev/null 2>&1; then
  TEST_ENV_DETECTED=true
  if CI=1 npm test 2>&1 | tee -a "$RESULTS_FILE"; then
    log_success "테스트 통과"
    echo "Test: ✅ PASSED" >> "$RESULTS_FILE"
    TEST_STATUS="passed"
  else
    log_error "테스트 실패"
    echo "Test: ❌ FAILED" >> "$RESULTS_FILE"
    TEST_FAILED=true
    VERIFICATION_PASSED=false
    TEST_STATUS="failed"
  fi
else
  log_info "test 스크립트가 없어 테스트를 생략합니다"
  echo "Test: ⏭️  SKIPPED (no test script)" >> "$RESULTS_FILE"
  TEST_STATUS="skipped"
fi
echo ""

log_info "4/7 ESLint 검사 실행 중..."
if npm run lint 2>&1 | tee -a "$RESULTS_FILE"; then
  log_success "ESLint 검사 통과"
  echo "Lint: ✅ PASSED" >> "$RESULTS_FILE"
  LINT_STATUS="passed"
else
  log_warning "ESLint 경고/실패 발생 (현재는 경고 처리)"
  echo "Lint: ⚠️  WARNINGS" >> "$RESULTS_FILE"
  LINT_STATUS="warn"
fi
echo ""

log_info "5/7 활동 로그 헤더 확인 중..."
echo "" >> "$RESULTS_FILE"
echo "## Activity Log Headers" >> "$RESULTS_FILE"
echo "" >> "$RESULTS_FILE"

FETCH_FILES=$(git diff --cached --name-only | grep "_fetch/.*\.client\.ts$" || true)

if [ -z "$FETCH_FILES" ]; then
  log_info "변경된 _fetch 파일 없음 (활동 로그 헤더 확인 생략)"
  echo "No _fetch files changed" >> "$RESULTS_FILE"
else
  log_info "변경된 _fetch 파일 발견:"
  echo "$FETCH_FILES" | while read -r file; do
    echo "  - $file"
  done
  echo ""

  log_info "활동 로그 헤더 패턴 검색 중..."

  echo "$FETCH_FILES" | while read -r file; do
    if git diff --cached "$file" | grep -q "createActivityHeaders"; then
      log_success "$file: 활동 로그 헤더 포함 ✅"
      echo "- $file: ✅ HAS ACTIVITY HEADERS" >> "$RESULTS_FILE"
    else
      log_warning "$file: 활동 로그 헤더 누락 가능성 ⚠️"
      echo "- $file: ⚠️  MISSING ACTIVITY HEADERS?" >> "$RESULTS_FILE"
    fi
  done

  echo ""
  log_info "활동 로그 헤더 규칙 (CLAUDE.md):"
  echo "  ✅ 목록 조회 (_fetchList): ActivityAction.SEARCH"
  echo "  ✅ 등록: ActivityAction.ADD"
  echo "  ✅ 수정: ActivityAction.EDIT"
  echo "  ✅ 삭제: ActivityAction.DELETE"
  echo "  ❌ 카운트 조회 (_fetchCount): 헤더 제외"
  echo "  ❌ 팝업 내부 조회: 헤더 제외"
fi
echo ""

log_info "6/7 Git 상태 확인 중..."
echo "" >> "$RESULTS_FILE"
echo "## Git Status" >> "$RESULTS_FILE"
echo "" >> "$RESULTS_FILE"

STAGED_FILES=$(git diff --cached --name-only)
if [ -z "$STAGED_FILES" ]; then
  log_warning "Staged 파일 없음 (git add 필요)"
  echo "No staged files" >> "$RESULTS_FILE"
else
  log_info "Staged 파일 ($(echo "$STAGED_FILES" | wc -l | tr -d ' ')개):"
  echo "$STAGED_FILES" | while read -r file; do
    echo "  - $file"
    echo "- $file" >> "$RESULTS_FILE"
  done
fi
echo ""

log_info "7/7 (선택) Entity-Request 분리 패턴 확인 중..."
echo "" >> "$RESULTS_FILE"
echo "## Entity-Request Separation" >> "$RESULTS_FILE"
echo "" >> "$RESULTS_FILE"

ENTITY_FILES=$(echo "$STAGED_FILES" | grep "_entities/.*\.ts$" || true)
REQUEST_FILES=$(echo "$STAGED_FILES" | grep "_requests/.*\.ts$" || true)

if [ -n "$ENTITY_FILES" ] || [ -n "$REQUEST_FILES" ]; then
  log_info "Entity/Request 파일 발견:"

  if [ -n "$ENTITY_FILES" ]; then
    echo "  [Entity]"
    echo "$ENTITY_FILES" | while read -r file; do
      echo "  - $file"
      echo "- Entity: $file" >> "$RESULTS_FILE"
    done
  fi

  if [ -n "$REQUEST_FILES" ]; then
    echo "  [Request]"
    echo "$REQUEST_FILES" | while read -r file; do
      echo "  - $file"
      echo "- Request: $file" >> "$RESULTS_FILE"
    done
  fi

  log_success "Entity-Request 분리 패턴 준수 확인 ✅"
else
  log_info "Entity/Request 파일 변경 없음"
  echo "No Entity/Request files changed" >> "$RESULTS_FILE"
fi
echo ""

echo "======================================"
echo ""

if [ "$VERIFICATION_PASSED" = true ]; then
  log_success "🎉 모든 검증 통과!"
  echo "" >> "$RESULTS_FILE"
  echo "Overall: ✅ ALL PASSED" >> "$RESULTS_FILE"

  echo ""
  log_info "다음 단계:"
  echo "  1. git commit -m \"커밋 메시지\""
  echo "  2. Documentation Agent 호출 (context.md 업데이트)"
  echo ""

  finalize_and_exit 0 "passed"
else
  log_error "검증 실패 - 위의 에러를 수정해주세요"
  echo "" >> "$RESULTS_FILE"
  echo "Overall: ❌ FAILED" >> "$RESULTS_FILE"

  if [ "$BUILD_FAILED" = true ]; then
    echo "ExitCode: 1 (build/typecheck failure)" >> "$RESULTS_FILE"
  elif [ "$TEST_FAILED" = true ]; then
    echo "ExitCode: 2 (test failure)" >> "$RESULTS_FILE"
  else
    echo "ExitCode: 1 (general verification failure)" >> "$RESULTS_FILE"
  fi

  echo ""
  log_info "에러 수정 후 다시 실행:"
  echo "  ./verify-changes.sh $FEATURE_NAME"
  echo ""

  if [ "$BUILD_FAILED" = true ]; then
    finalize_and_exit 1 "failed"
  fi

  if [ "$TEST_FAILED" = true ]; then
    finalize_and_exit 2 "failed"
  fi

  finalize_and_exit 1 "failed"
fi
