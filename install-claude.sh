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

# 압축 해제 함수 (unzip 또는 python 사용)
extract_zip() {
	local zip_file=$1
	local dest_dir=$2

	if [ "$HAS_UNZIP" = true ]; then
		unzip -q "$zip_file" -d "$dest_dir"
		return
	fi

	if [ -n "$PYTHON_CMD" ]; then
		"$PYTHON_CMD" - "$zip_file" "$dest_dir" <<'PY'
import sys
import zipfile

zip_path = sys.argv[1]
dest = sys.argv[2]

with zipfile.ZipFile(zip_path) as zf:
    zf.extractall(dest)
PY
		return
	fi

	print_error "압축 해제 도구(unzip 또는 python)가 필요합니다."
	exit 1
}

# JSON 병합 함수 (settings.local.json 처리를 위해)
merge_json() {
	local base_file=$1    # 새로 설치될 파일 (Base)
	local user_file=$2    # 기존 사용자 파일 (Permissions 유지 대상)
	local output_file=$3  # 결과 파일

	if [ -n "$PYTHON_CMD" ]; then
		"$PYTHON_CMD" - "$base_file" "$user_file" "$output_file" <<'PY'
import sys
import json

base_path = sys.argv[1]
user_path = sys.argv[2]
output_path = sys.argv[3]

try:
    with open(base_path, 'r', encoding='utf-8') as f:
        base_data = json.load(f)
    
    with open(user_path, 'r', encoding='utf-8') as f:
        user_data = json.load(f)

    # Base 데이터를 기준으로 시작 (새로운 설정들)
    merged_data = base_data.copy()
    
    # 사용자 파일의 permissions가 있으면 덮어쓰기 (기존 권한 유지)
    if 'permissions' in user_data:
        merged_data['permissions'] = user_data['permissions']
        
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(merged_data, f, indent=2, ensure_ascii=False)
except Exception as e:
    sys.exit(1)
PY
		return $?
	fi
	return 1
}

# 사용법 출력
usage() {
	cat <<EOF
사용법: $0 [OPTIONS]

옵션:
  --no-backup            기존 AI 설정 백업하지 않음
  --dry-run              실제 변경 없이 미리보기만
  --force                (deprecated, 자동 백업 후 설치)
  --include-project      PROJECT.md 포함 (기본값: 제외)
  --debug                MCP 추가 명령 디버그 출력
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
DEBUG_MCP=false
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
	--debug)
		DEBUG_MCP=true
		shift
		;;
	--exclude)
		EXCLUDE_PATTERNS+=("$2")
		shift 2
		;;
	-h | --help)
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

# .mcp.json은 전역 설치 후 불필요하므로 항상 제외
EXCLUDE_PATTERNS+=(".mcp.json")

# 사용자 파일 자동 보호 (기존 .claude가 있을 경우)
USER_FILES=()
SEEN_FILES_LIST="" # 중복 방지를 위한 문자열 목록

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

				# 중복 체크 (Bash 3.2 호환)
				if [[ ! "$SEEN_FILES_LIST" =~ "|$rel_file|" ]]; then
					USER_FILES+=("$rel_file")
					# settings.local.json은 병합을 위해 제외 목록에서 뺌 (새 버전 유지)
					if [ "$rel_file" != "settings.local.json" ]; then
						EXCLUDE_PATTERNS+=("$rel_file")
					fi
					SEEN_FILES_LIST="$SEEN_FILES_LIST|$rel_file|"
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

				if [[ ! "$SEEN_FILES_LIST" =~ "|$rel_dir|" ]]; then
					USER_FILES+=("$rel_dir/")
					EXCLUDE_PATTERNS+=("$rel_dir")
					SEEN_FILES_LIST="$SEEN_FILES_LIST|$rel_dir|"
				fi
			fi
		done < <(find .claude -type d -name "$dir_pattern" 2>/dev/null)
	done
fi

print_header

# 1. 필수 도구 확인
print_info "필수 도구 확인 중..."
if ! command -v curl &>/dev/null; then
	print_error "curl이 설치되어 있지 않습니다."
	exit 1
fi

HAS_UNZIP=false
if command -v unzip &>/dev/null; then
	HAS_UNZIP=true
fi

PYTHON_CMD=""
if command -v python3 &>/dev/null; then
	PYTHON_CMD="python3"
elif command -v python &>/dev/null; then
	PYTHON_CMD="python"
elif command -v py &>/dev/null; then
	PYTHON_CMD="py"
fi

if [ "$HAS_UNZIP" = false ] && [ -z "$PYTHON_CMD" ]; then
	print_error "unzip 또는 python이 설치되어 있지 않습니다."
	exit 1
fi
print_info "필수 도구 확인 완료"

# 1.5. 추가 도구 확인 (MCP용)
if command -v uv &>/dev/null; then
	print_info "✓ uv 설치 확인됨 (Codex MCP용)"
else
	print_warn "uv가 설치되어 있지 않습니다. Codex MCP 사용을 위해 설치를 권장합니다."
	echo "  설치 방법: pip install uv  또는  curl -LsSf https://astral.sh/uv/install.sh | sh"
fi

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
extract_zip "$ZIP_FILE" "$TEMP_DIR"

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
	print_info "사용자 파일 복원 중..."
	for file in "${USER_FILES[@]}"; do
		item="${file%/}"
		src="$USER_STASH_DIR/$item"
		dest=".claude/$item"
		
		# settings.local.json 파일이고, 새 파일도 존재하면 병합 시도
		if [ "$item" == "settings.local.json" ] && [ -f "$dest" ]; then
			print_info "  Merging settings.local.json..."
			if merge_json "$dest" "$src" "$dest.merged"; then
				mv "$dest.merged" "$dest"
				print_info "  ✓ $item (Merged permissions)"
				continue
			else
				print_warn "  병합 실패, 기존 파일로 복원합니다."
			fi
		fi

		if [ -e "$src" ]; then
			mkdir -p "$(dirname "$dest")"
			cp -r "$src" "$dest"
			print_info "  ✓ $item (Restored)"
		fi
	done
fi

# 9. Memory MCP 프로젝트 설정 (기본값으로 항상 설정)
echo ""
print_info "Memory MCP 프로젝트 설정 중..."

if command -v claude &>/dev/null; then
	# 프로젝트별 memory.json 파일 경로 (파일 생성용 - 절대경로)
	MEMORY_FILE_ABS="$(pwd)/.claude/memory.json"
	# MCP 환경변수용 경로 (cross-platform - 상대경로)
	MEMORY_FILE_REL=".claude/memory.json"
	
	# memory.json 파일이 없으면 초기화
	if [ ! -f "$MEMORY_FILE_ABS" ]; then
		echo '{"entities": [], "relations": []}' > "$MEMORY_FILE_ABS"
		print_info "  └ 메모리 파일 생성됨: $MEMORY_FILE_ABS"
	fi
	
	# Memory MCP를 프로젝트 스코프로 추가 (상대경로 사용 - Windows/Mac/Linux 호환)
	if claude mcp add -s project -e "MEMORY_FILE_PATH=$MEMORY_FILE_REL" memory -- npx -y @modelcontextprotocol/server-memory 2>&1 | grep -qi "already exists"; then
		print_info "  ✓ memory: 이미 존재함 (project)"
	else
		print_info "  ✓ memory: 추가 완료 (project)"
	fi
	print_info "  └ 메모리 데이터 경로: $MEMORY_FILE_REL (프로젝트별)"
	print_info "✓ Memory MCP 프로젝트 설정 완료"
else
	print_warn "claude 명령어를 찾을 수 없습니다. MCP 설정을 건너뜁니다."
	print_info "Claude Code 설치 후 수동으로 MCP 서버를 추가하세요:"
	echo "  claude mcp add -s project memory -- npx -y @modelcontextprotocol/server-memory"
fi

# 8.5. claude-delegator 플러그인 설치 안내
echo ""
print_info "claude-delegator 플러그인 설정 확인 중..."

# Codex CLI 설치 여부 확인
CODEX_INSTALLED=false
if command -v codex &>/dev/null; then
	CODEX_INSTALLED=true
	print_info "✓ Codex CLI가 이미 설치되어 있습니다."
else
	print_warn "Codex CLI가 설치되어 있지 않습니다."
	echo ""
	read -p "Codex CLI를 설치하시겠습니까? (y/N): " -n 1 -r
	echo
	if [[ $REPLY =~ ^[Yy]$ ]]; then
		print_info "Codex CLI 설치 중..."
		if npm install -g @openai/codex; then
			CODEX_INSTALLED=true
			print_info "✓ Codex CLI 설치 완료"
			echo ""
			print_warn "Codex 인증이 필요합니다. 다음 명령어를 실행하세요:"
			echo "  codex login"
		else
			print_error "Codex CLI 설치 실패"
		fi
	else
		print_info "Codex CLI 설치를 건너뜁니다."
	fi
fi

if [ "$CODEX_INSTALLED" = true ]; then
	print_info "Codex 로그인 상태 확인 중..."
	if codex login status 2>&1 | grep -qi "logged in"; then
		print_info "✓ Codex 로그인 확인됨"
	else
		print_warn "Codex에 로그인되어 있지 않습니다. MCP가 정상 작동하지 않을 수 있습니다."
		echo -e "  ${YELLOW}codex login${NC} 명령어를 실행하여 로그인해주세요."
	fi
fi


# claude-delegator 플러그인 설치 안내
# claude-delegator 플러그인 자동 설치
echo ""
if command -v claude &>/dev/null; then
	print_info "Claude CLI를 사용하여 claude-delegator 플러그인 자동 설치 중..."

	# 1. Marketplace 추가
	if output=$(claude plugin marketplace add jarrodwatts/claude-delegator 2>&1); then
		print_info "  ✓ Marketplace 추가 성공"
	else
		# 이미 존재할 경우 등 에러 메시지 출력 (정보성)
		print_info "  Marketplace 처리: $output"
	fi

	# 2. Plugin 설치
	if output=$(claude plugin install claude-delegator 2>&1); then
		print_info "  ✓ claude-delegator 플러그인 설치 성공"
	else
		print_info "  Plugin 설치 처리: $output"
	fi

	echo ""
	echo -e "${YELLOW}=========================================${NC}"
	echo -e "${YELLOW}  설정 마무리 안내${NC}"
	echo -e "${YELLOW}=========================================${NC}"
	echo ""
	echo "플러그인 설정을 위해 Claude Code에서 다음 명령어를 실행해주세요:"
	echo ""
	echo -e "     ${GREEN}/claude-delegator:setup${NC}"
	echo ""
else
	# claude 명령어가 없을 경우 수동 안내
	echo -e "${YELLOW}=========================================${NC}"
	echo -e "${YELLOW}  claude-delegator 플러그인 설치 안내${NC}"
	echo -e "${YELLOW}=========================================${NC}"
	echo "Claude CLI를 찾을 수 없습니다. 다음 명령어를 직접 실행하세요:"
	echo ""
	echo "  1. 마켓플레이스 추가: /plugin marketplace add jarrodwatts/claude-delegator"
	echo "  2. 플러그인 설치: /plugin install claude-delegator"
	echo "  3. 설정 실행: /claude-delegator:setup"
	echo ""
fi

if [ "$CODEX_INSTALLED" = false ]; then
	print_warn "주의: claude-delegator를 사용하려면 Codex CLI가 필요합니다."
	echo "  npm install -g @openai/codex"
	echo "  codex login"
	echo ""
fi

# 9. 정리
rm -rf "$TEMP_DIR"

# 10. 성공 메시지
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
if [ -d ".claude/skills/moonshot-orchestrator" ]; then
	echo "  ✓ .claude/skills/moonshot-*        (PM 워크플로우 스킬)"
fi
if [ -d ".claude/agents" ]; then
	echo "  ✓ .claude/agents/            (에이전트 프롬프트)"
fi
if [ -d ".claude/rules" ]; then
	echo "  ✓ .claude/rules/             (모듈식 규칙)"
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

# Suggest generating PROJECT.md when missing

if [ ! -f ".claude/PROJECT.md" ]; then
	print_warn "PROJECT.md가 없습니다."
	echo "  - 'project-md-refresh' 스킬을 실행해 생성/갱신하세요."
	echo "  - 예: Claude Code에 이 저장소에서 project-md-refresh를 실행해달라고 요청"
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

# 11. .codex 설정 여부 확인
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
		cat >.codex/README.md <<'CODEX_EOF'
# Codex MCP 설정

이 디렉토리는 Codex MCP 서버 설정을 위한 공간입니다.

## 기본 설정

- `CODEX.md`: 글로벌 규칙 (심볼릭 링크 → .claude/CLAUDE.md)
- `PROJECT.md`: 프로젝트별 규칙 (수정 가능)

## Codex MCP 활용

Codex MCP를 통해 다음 기능을 사용할 수 있습니다:
- 계획 검증 (codex-validate-plan)
- 코드 리뷰 (codex-review-code)

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
