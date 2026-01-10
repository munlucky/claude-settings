#!/bin/bash

# Claude Code 설정 동기화 스크립트
# GitHub에서 최신 .claude 디렉토리를 다운로드하여 현재 프로젝트에 적용합니다.

set -e

REPO_URL="https://github.com/munlucky/claude-settings"
BRANCH="main"
BACKUP_SUFFIX=".backup-$(date +%Y%m%d-%H%M%S)"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 헬퍼 함수
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo ""
    echo "========================================="
    echo "  Claude Code Settings Installer"
    echo "========================================="
    echo ""
}

# 사용법 출력
usage() {
    cat << EOF
사용법: $0 [OPTIONS]

옵션:
  --no-backup            기존 .claude 백업하지 않음
  --dry-run              실제 변경 없이 미리보기만
  --force                확인 없이 강제 실행
  --include-project      PROJECT.md 포함 (기본값: 제외)
  --exclude PATTERN      추가로 특정 파일/디렉토리 제외
  -h, --help             도움말 출력

기본 동작:
  - PROJECT.md는 기본적으로 제외됩니다 (기존 프로젝트 설정 보호)
  - PROJECT.md도 설치하려면 --include-project 옵션 사용

예시:
  $0                                    # 기본 실행 (PROJECT.md 제외)
  $0 --include-project                  # PROJECT.md 포함하여 설치
  $0 --exclude "*.local.json"           # 추가 파일 제외
  $0 --dry-run                          # 미리보기

EOF
    exit 0
}

# 옵션 파싱
DO_BACKUP=true
DRY_RUN=false
FORCE=false
INCLUDE_PROJECT=false
EXCLUDE_PATTERNS=()

while [[ $# -gt 0 ]]; do
    case $1 in
        --no-backup)
            DO_BACKUP=false
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        --include-project)
            INCLUDE_PROJECT=true
            shift
            ;;
        --exclude)
            EXCLUDE_PATTERNS+=("$2")
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            print_error "알 수 없는 옵션: $1"
            usage
            ;;
    esac
done

# 기본값: PROJECT.md 제외 (--include-project가 없으면)
if [ "$INCLUDE_PROJECT" = false ]; then
    EXCLUDE_PATTERNS+=("PROJECT.md")
fi

print_header

# 1. 필수 도구 확인
print_info "필수 도구 확인 중..."
for cmd in curl unzip; do
    if ! command -v $cmd &> /dev/null; then
        print_error "$cmd가 설치되어 있지 않습니다."
        exit 1
    fi
done
print_info "✓ 필수 도구 확인 완료"

# 2. 기존 .claude 디렉토리 확인
if [ -d ".claude" ]; then
    print_warn ".claude 디렉토리가 이미 존재합니다."

    if [ "$FORCE" = false ] && [ "$DRY_RUN" = false ]; then
        read -p "덮어쓰시겠습니까? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "설치 취소됨"
            exit 0
        fi
    fi

    # 백업
    if [ "$DO_BACKUP" = true ] && [ "$DRY_RUN" = false ]; then
        BACKUP_DIR=".claude${BACKUP_SUFFIX}"
        print_info "기존 .claude를 백업 중... → $BACKUP_DIR"
        cp -r .claude "$BACKUP_DIR"
        print_info "✓ 백업 완료"
    fi
fi

# 3. Dry-run 모드
if [ "$DRY_RUN" = true ]; then
    print_info "[DRY-RUN] 다음 작업이 수행됩니다:"
    echo "  - GitHub에서 다운로드: $REPO_URL/archive/$BRANCH.zip"
    echo "  - .claude 디렉토리 덮어쓰기"
    if [ ${#EXCLUDE_PATTERNS[@]} -gt 0 ]; then
        echo "  - 제외 패턴: ${EXCLUDE_PATTERNS[*]}"
    fi
    exit 0
fi

# 4. GitHub에서 다운로드
print_info "GitHub에서 최신 버전 다운로드 중..."
TEMP_DIR=$(mktemp -d)
ZIP_FILE="$TEMP_DIR/claude-settings.zip"

curl -L "$REPO_URL/archive/$BRANCH.zip" -o "$ZIP_FILE" --progress-bar

if [ ! -f "$ZIP_FILE" ]; then
    print_error "다운로드 실패"
    rm -rf "$TEMP_DIR"
    exit 1
fi
print_info "✓ 다운로드 완료"

# 5. 압축 해제
print_info ".claude 디렉토리 추출 중..."
unzip -q "$ZIP_FILE" "claude-settings-$BRANCH/.claude/*" -d "$TEMP_DIR"

if [ ! -d "$TEMP_DIR/claude-settings-$BRANCH/.claude" ]; then
    print_error ".claude 디렉토리를 찾을 수 없습니다"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# 6. 제외 패턴 처리
if [ ${#EXCLUDE_PATTERNS[@]} -gt 0 ]; then
    print_info "제외 패턴 적용 중..."
    for pattern in "${EXCLUDE_PATTERNS[@]}"; do
        find "$TEMP_DIR/claude-settings-$BRANCH/.claude" -name "$pattern" -exec rm -rf {} + 2>/dev/null || true
        print_info "  ✓ 제외: $pattern"
    done
fi

# 7. .claude 디렉토리 복사
print_info ".claude 디렉토리 설치 중..."
rm -rf .claude
cp -r "$TEMP_DIR/claude-settings-$BRANCH/.claude" .
print_info "✓ 설치 완료"

# 8. 정리
rm -rf "$TEMP_DIR"

# 9. 성공 메시지
echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}  설치 완료!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
print_info "다음 파일들이 설치되었습니다:"
echo ""

# 주요 파일 목록 출력
if [ -f ".claude/CLAUDE.md" ]; then
    echo "  ✓ .claude/CLAUDE.md          (글로벌 개발 지침)"
fi
if [ -f ".claude/PROJECT.md" ]; then
    echo "  ✓ .claude/PROJECT.md         (프로젝트별 규칙 템플릿)"
fi
if [ -d ".claude/skills/pm-orchestrator" ]; then
    echo "  ✓ .claude/skills/pm-*        (PM 워크플로우 스킬)"
fi
if [ -d ".claude/agents" ]; then
    echo "  ✓ .claude/agents/            (에이전트 프롬프트)"
fi

echo ""
print_warn "다음 단계:"
echo "  1. .claude/PROJECT.md를 프로젝트에 맞게 수정하세요"
echo "  2. Git에 커밋: git add .claude && git commit -m 'Add Claude Code settings'"
echo "  3. Claude Code에서 코드 작업을 요청하면 자동으로 PM 워크플로우가 실행됩니다"

if [ "$DO_BACKUP" = true ] && [ -d ".claude${BACKUP_SUFFIX}" ]; then
    echo ""
    print_info "백업 위치: .claude${BACKUP_SUFFIX}"
    echo "  복원: mv .claude${BACKUP_SUFFIX} .claude"
fi

echo ""
