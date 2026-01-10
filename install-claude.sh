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
  --no-backup            기존 AI 설정 백업하지 않음
  --dry-run              실제 변경 없이 미리보기만
  --force                (deprecated, 자동 백업 후 설치)
  --include-project      PROJECT.md 포함 (기본값: 제외)
  --exclude PATTERN      추가로 특정 파일/디렉토리 제외
  -h, --help             도움말 출력

기본 동작:
  - .claude, .codex, .gemini 중 하나라도 존재하면 자동 백업 후 설치
  - PROJECT.md는 기본적으로 제외됩니다 (기존 프로젝트 설정 보호)
  - 사용자 파일 자동 보호: *.local.*, custom/, .env* 등
  - PROJECT.md도 설치하려면 --include-project 옵션 사용

보호되는 파일 패턴:
  - PROJECT.md (기본값, --include-project로 포함 가능)
  - *.local.json, *.local.yaml, *.local.md
  - settings.local.*
  - custom/ 디렉토리
  - .env* 파일

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

# 사용자 파일 자동 보호 (기존 .claude가 있을 경우)
USER_FILES=()
declare -A SEEN_FILES  # 중복 방지

if [ -d ".claude" ]; then
    # 보호할 파일 패턴 정의
    PROTECTED_PATTERNS=(
        "*.local.json"
        "*.local.yaml"
        "*.local.md"
        "settings.local.*"
        ".env*"
    )

    PROTECTED_DIRS=(
        "custom"
    )

    # 파일 패턴 검색
    for pattern in "${PROTECTED_PATTERNS[@]}"; do
        while IFS= read -r file; do
            if [ -n "$file" ]; then
                # .claude/ 접두사 제거
                rel_file="${file#./}"
                rel_file="${rel_file#.claude/}"

                # 중복 체크
                if [ -z "${SEEN_FILES[$rel_file]}" ]; then
                    USER_FILES+=("$rel_file")
                    EXCLUDE_PATTERNS+=("$rel_file")
                    SEEN_FILES[$rel_file]=1
                fi
            fi
        done < <(find .claude -type f -name "$pattern" 2>/dev/null)
    done

    # 디렉토리 패턴 검색
    for dir_pattern in "${PROTECTED_DIRS[@]}"; do
        while IFS= read -r dir; do
            if [ -n "$dir" ]; then
                rel_dir="${dir#./}"
                rel_dir="${rel_dir#.claude/}"

                if [ -z "${SEEN_FILES[$rel_dir]}" ]; then
                    USER_FILES+=("$rel_dir/")
                    EXCLUDE_PATTERNS+=("$rel_dir")
                    SEEN_FILES[$rel_dir]=1
                fi
            fi
        done < <(find .claude -type d -name "$dir_pattern" 2>/dev/null)
    done
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

# 2. 기존 AI 설정 디렉토리 확인 및 자동 백업
BACKUP_DIRS=()
HAS_EXISTING=false

for dir in ".claude" ".codex" ".gemini"; do
    if [ -d "$dir" ]; then
        HAS_EXISTING=true
        if [ "$DO_BACKUP" = true ]; then
            BACKUP_DIRS+=("$dir")
        fi
    fi
done

if [ "$HAS_EXISTING" = true ]; then
    if [ ${#BACKUP_DIRS[@]} -gt 0 ]; then
        print_info "기존 AI 설정 디렉토리 발견: ${BACKUP_DIRS[*]}"

        # 백업 실행
        if [ "$DRY_RUN" = false ]; then
            for dir in "${BACKUP_DIRS[@]}"; do
                BACKUP_DIR="${dir}${BACKUP_SUFFIX}"
                print_info "백업 중: $dir → $BACKUP_DIR"
                cp -r "$dir" "$BACKUP_DIR"
            done
            print_info "✓ 백업 완료 (${#BACKUP_DIRS[@]}개 디렉토리)"
        fi
    else
        print_warn "기존 디렉토리가 존재하지만 --no-backup 옵션으로 백업하지 않습니다."
    fi
fi

# 3. Dry-run 모드
if [ "$DRY_RUN" = true ]; then
    print_info "[DRY-RUN] 다음 작업이 수행됩니다:"
    if [ ${#BACKUP_DIRS[@]} -gt 0 ]; then
        echo "  - 백업할 디렉토리: ${BACKUP_DIRS[*]}"
    fi
    echo "  - GitHub에서 다운로드: $REPO_URL/archive/$BRANCH.zip"
    echo "  - .claude 디렉토리 설치"
    if [ ${#EXCLUDE_PATTERNS[@]} -gt 0 ]; then
        echo "  - 제외 패턴: ${EXCLUDE_PATTERNS[*]}"
    fi
    if [ ${#USER_FILES[@]} -gt 0 ]; then
        echo ""
        print_info "보호될 사용자 파일 (${#USER_FILES[@]}개):"
        for file in "${USER_FILES[@]}"; do
            echo "    ✓ $file"
        done
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
# 6.5. Stash protected user files from existing .claude
USER_STASH_DIR=""
if [ ${#USER_FILES[@]} -gt 0 ]; then
    print_info "Stashing protected user files..."
    USER_STASH_DIR="$TEMP_DIR/user-files"
    mkdir -p "$USER_STASH_DIR"
    for file in "${USER_FILES[@]}"; do
        item="${file%/}"
        src=".claude/$item"
        dest="$USER_STASH_DIR/$item"
        if [ -e "$src" ]; then
            mkdir -p "$(dirname "$dest")"
            cp -r "$src" "$dest"
        fi
    done
fi


# 7. .claude 디렉토리 복사
print_info ".claude 디렉토리 설치 중..."
mkdir -p .claude
cp -r "$TEMP_DIR/claude-settings-$BRANCH/.claude/." .claude/
print_info "✓ 설치 완료"
# 7.5. Restore protected user files into new .claude
if [ -n "$USER_STASH_DIR" ] && [ -d "$USER_STASH_DIR" ]; then
    print_info "Restoring protected user files..."
    for file in "${USER_FILES[@]}"; do
        item="${file%/}"
        src="$USER_STASH_DIR/$item"
        dest=".claude/$item"
        if [ -e "$src" ]; then
            mkdir -p "$(dirname "$dest")"
            cp -r "$src" "$dest"
        fi
    done
fi


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

# 보호된 사용자 파일 표시
if [ ${#USER_FILES[@]} -gt 0 ]; then
    print_info "보호된 사용자 파일 (${#USER_FILES[@]}개):"
    for file in "${USER_FILES[@]}"; do
        echo "  ✓ .claude/$file"
    done
    echo ""
fi

print_warn "다음 단계:"
echo "  1. .claude/PROJECT.md를 프로젝트에 맞게 수정하세요"
echo "  2. Git에 커밋: git add .claude && git commit -m 'Add Claude Code settings'"
echo "  3. Claude Code에서 코드 작업을 요청하면 자동으로 PM 워크플로우가 실행됩니다"

if [ ${#BACKUP_DIRS[@]} -gt 0 ]; then
    echo ""
    print_info "백업된 디렉토리:"
    for dir in "${BACKUP_DIRS[@]}"; do
        BACKUP_DIR="${dir}${BACKUP_SUFFIX}"
        if [ -d "$BACKUP_DIR" ]; then
            echo "  ✓ $BACKUP_DIR"
            echo "    복원: mv $BACKUP_DIR $dir"
        fi
    done
fi

# 10. .codex 설정 여부 확인
echo ""
if [ ! -d ".codex" ]; then
    echo ""
    print_warn "추가 설정"
    read -p ".codex 폴더도 설정하시겠습니까? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_info ".codex 디렉토리 생성 중..."
        mkdir -p .codex

        # .claude의 주요 파일을 .codex에 심볼릭 링크
        if [ -f ".claude/CLAUDE.md" ]; then
            ln -sf "../.claude/CLAUDE.md" ".codex/CODEX.md"
            print_info "✓ .codex/CODEX.md 생성 (→ .claude/CLAUDE.md)"
        fi

        if [ -f ".claude/PROJECT.md" ]; then
            cp ".claude/PROJECT.md" ".codex/PROJECT.md"
            print_info "✓ .codex/PROJECT.md 생성 (복사본)"
        fi

        # .codex용 간단한 README 생성
        cat > .codex/README.md << 'CODEX_EOF'
# Codex MCP 설정

이 디렉토리는 Codex MCP 서버 설정을 위한 공간입니다.

## 기본 설정

- `CODEX.md`: 글로벌 규칙 (심볼릭 링크 → .claude/CLAUDE.md)
- `PROJECT.md`: 프로젝트별 규칙 (수정 가능)

## Codex MCP 활용

Codex MCP를 통해 다음 기능을 사용할 수 있습니다:
- 계획 검증 (codex-validate-plan)
- 코드 리뷰 (codex-review-code)
- 통합 테스트 검증 (codex-test-integration)

자세한 내용은 `.claude/skills/codex-*` 스킬을 참고하세요.
CODEX_EOF
        print_info "✓ .codex/README.md 생성"

        echo ""
        print_info ".codex 설정 완료!"
        echo "  - .codex/CODEX.md (심볼릭 링크)"
        echo "  - .codex/PROJECT.md"
        echo "  - .codex/README.md"
    else
        print_info ".codex 설정을 건너뜁니다."
    fi
fi

echo ""
