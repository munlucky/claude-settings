#!/bin/bash

# Claude/Codex 설정 동기화 스크립트
# GitHub에서 최신 .claude를 다운로드하고, .agents/AGENTS.md 브리지와 Codex 전역 skills 링크를 구성합니다.

set -e

REPO_URL="https://github.com/munlucky/claude-settings"
BRANCH="main"
BACKUP_SUFFIX=".backup-$(date +%Y%m%d-%H%M%S)"
CODEX_SKILLS_DIR=""
CODEX_SKILL_LINKS=()
CODEX_BACKUP_PATHS=()

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

setup_codex_skills() {
	local source_skills_dir=".claude/skills"
	local codex_home="${CODEX_HOME:-$HOME/.codex}"
	local linked_count=0
	local source_root=""

	echo ""
	print_info "Codex 전역 skills 동기화 중..."

	if [ ! -d "$source_skills_dir" ]; then
		print_warn "스킬 디렉토리를 찾지 못했습니다: $source_skills_dir"
		return
	fi

	CODEX_SKILLS_DIR="$codex_home/skills"
	mkdir -p "$CODEX_SKILLS_DIR"
	source_root="$(cd "$source_skills_dir" && pwd -P)"

	for skill_path in "$source_root"/*; do
		local skill_name=""
		local codex_skill_path=""
		local existing_target=""

		if [ ! -d "$skill_path" ]; then
			continue
		fi

		skill_name="$(basename "$skill_path")"
		codex_skill_path="$CODEX_SKILLS_DIR/$skill_name"

		if [ -L "$codex_skill_path" ]; then
			existing_target="$(readlink "$codex_skill_path" 2>/dev/null || true)"
			if [ "$existing_target" = "$skill_path" ]; then
				CODEX_SKILL_LINKS+=("$codex_skill_path")
				linked_count=$((linked_count + 1))
				continue
			fi
		fi

		if [ -e "$codex_skill_path" ] || [ -L "$codex_skill_path" ]; then
			if [ "$DO_BACKUP" = true ]; then
				local backup_path="${codex_skill_path}${BACKUP_SUFFIX}"
				print_info "Codex skill 백업 중: $codex_skill_path → $backup_path"
				mv "$codex_skill_path" "$backup_path"
				CODEX_BACKUP_PATHS+=("$backup_path")
			else
				print_warn "기존 Codex skill을 덮어씁니다: $codex_skill_path"
				rm -rf "$codex_skill_path"
			fi
		fi

		ln -s "$skill_path" "$codex_skill_path"
		CODEX_SKILL_LINKS+=("$codex_skill_path")
		linked_count=$((linked_count + 1))
	done

	print_info "✓ Codex skills ${linked_count}개 연결 완료 (${CODEX_SKILLS_DIR})"
}

setup_agents_bridge() {
	echo ""
	print_info ".agents/skills 및 AGENTS.md 동기화 중..."

	mkdir -p ".agents"
	rm -rf ".agents/skills"
	ln -s "../.claude/skills" ".agents/skills"
	print_info "✓ .agents/skills 생성 (→ ../.claude/skills)"

	rm -f "AGENTS.md"
	ln -s ".claude/CLAUDE.md" "AGENTS.md"
	print_info "✓ AGENTS.md 생성 (→ .claude/CLAUDE.md)"
}

setup_browser_runtime() {
	local runtime_install_script=".claude/scripts/install-browser-runtime.sh"
	local runtime_dir=".claude/tools/browserd"

	echo ""
	print_info "브라우저 런타임 기본 환경 설정 중..."

	if [ ! -d "$runtime_dir" ]; then
		print_warn "브라우저 런타임 디렉토리를 찾지 못했습니다: $runtime_dir"
		return
	fi

	chmod +x ".claude/bin/browserctl" "$runtime_install_script" 2>/dev/null || true

	if [ -x "$runtime_install_script" ]; then
		if "$runtime_install_script" --force; then
			print_info "✓ browserctl 전역 링크 및 PATH helper 설치 완료"
		else
			print_warn "browserctl 전역 설치 중 경고가 발생했습니다."
		fi
	else
		print_warn "browserctl 설치 스크립트를 찾지 못했습니다: $runtime_install_script"
	fi

	if ! command -v node &>/dev/null; then
		if command -v bun &>/dev/null; then
			print_warn "bun은 확인됐지만 현재 브라우저 런타임 의존성 설치는 Node/npm 기준입니다."
		else
			print_warn "node가 없어 Playwright 런타임 의존성 설치를 건너뜁니다."
		fi
		echo "  설치 후 다시 실행: cd $runtime_dir && npm install && npx playwright install chromium"
		return
	fi

	if ! command -v npm &>/dev/null; then
		print_warn "npm이 없어 Playwright 런타임 의존성 설치를 건너뜁니다."
		echo "  설치 후 다시 실행: cd $runtime_dir && npm install && npx playwright install chromium"
		return
	fi

	if ! command -v npx &>/dev/null; then
		print_warn "npx가 없어 Chromium 브라우저 설치를 건너뜁니다."
		echo "  설치 후 다시 실행: cd $runtime_dir && npx playwright install chromium"
		return
	fi

	print_info "  └ Playwright 의존성 확인 및 설치 중..."
	if (cd "$runtime_dir" && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install); then
		print_info "  ✓ Playwright 의존성 설치 완료"
	else
		print_warn "  Playwright 의존성 설치 실패"
		return
	fi

	print_info "  └ Chromium 브라우저 확인 및 설치 중..."
	if (cd "$runtime_dir" && PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium); then
		print_info "  ✓ Chromium 브라우저 설치 완료"
	else
		print_warn "  Chromium 브라우저 설치 실패"
		return
	fi

	if command -v browserctl &>/dev/null; then
		print_info "✓ browserctl 사용 가능: $(command -v browserctl)"
	else
		print_warn "browserctl PATH 확인이 필요합니다. 새 로그인 셸에서 다시 확인하세요."
	fi
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

# 줄 기반 정책 파일 병합 (.claudeignore 등)
merge_line_file() {
	local base_file=$1
	local user_file=$2
	local output_file=$3

	if [ -n "$PYTHON_CMD" ]; then
		"$PYTHON_CMD" - "$base_file" "$user_file" "$output_file" <<'PY'
import sys

base_path = sys.argv[1]
user_path = sys.argv[2]
output_path = sys.argv[3]

seen = set()
merged = []

for path in (base_path, user_path):
    with open(path, "r", encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.rstrip("\n")
            if line in seen:
                continue
            seen.add(line)
            merged.append(line)

with open(output_path, "w", encoding="utf-8") as handle:
    handle.write("\n".join(merged) + "\n")
PY
		return $?
	fi

	cat "$base_file" "$user_file" | awk '!seen[$0]++' > "$output_file"
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
  - .claude, .agents, AGENTS.md, .claudeignore 중 존재 항목 자동 백업 후 설치
  - PROJECT.md는 기본적으로 제외됩니다 (기존 프로젝트 설정 보호)
  - 사용자 파일 자동 보호: *.local.*, custom/, .env* 등
  - .claudeignore는 기본 denylist를 설치하고 기존 파일이 있으면 병합
  - .claude/skills/* 를 Codex 전역 skills(${CODEX_HOME:-~/.codex}/skills/*)에 심볼릭 링크
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

# 1.5. 추가 도구 확인 (MCP / Browser Automation)
if command -v uv &>/dev/null; then
	print_info "✓ uv 설치 확인됨 (Codex MCP/Agent Browser 실행 기반)"
else
	print_warn "uv가 설치되어 있지 않습니다. Codex MCP/Agent Browser 사용을 위해 설치를 권장합니다."
	echo "  설치 방법: pip install uv  또는  curl -LsSf https://astral.sh/uv/install.sh | sh"
fi

if command -v agent-browser &>/dev/null; then
	print_info "✓ agent-browser 설치 확인됨 (기능 흐름 E2E 검증 가능)"
elif command -v uvx &>/dev/null; then
	print_info "✓ uvx 사용 가능: agent-browser를 전역 설치 없이 실행할 수 있습니다."
	echo "  예시: uvx agent-browser --help"
else
	print_warn "agent-browser 실행 환경을 찾지 못했습니다."
	echo "  권장: uv 설치 후 'uvx agent-browser --help' 로 실행 가능 여부를 확인하세요."
fi

# 2. 기존 AI 설정 디렉토리 확인 및 자동 백업
BACKUP_DIRS=()
BACKUP_FILES=()
HAS_EXISTING=false

for dir in ".claude" ".agents"; do
	if [ -d "$dir" ]; then
		HAS_EXISTING=true
		if [ "$DO_BACKUP" = true ]; then
			BACKUP_DIRS+=("$dir")
		fi
	fi
done

if [ -e "AGENTS.md" ]; then
	HAS_EXISTING=true
	if [ "$DO_BACKUP" = true ]; then
		BACKUP_FILES+=("AGENTS.md")
	fi
fi

if [ -e ".claudeignore" ]; then
	HAS_EXISTING=true
	if [ "$DO_BACKUP" = true ]; then
		BACKUP_FILES+=(".claudeignore")
	fi
fi

if [ "$HAS_EXISTING" = true ]; then
	if [ ${#BACKUP_DIRS[@]} -gt 0 ] || [ ${#BACKUP_FILES[@]} -gt 0 ]; then
		print_info "기존 AI 설정 항목 발견"
		if [ ${#BACKUP_DIRS[@]} -gt 0 ]; then
			echo "  - 디렉토리: ${BACKUP_DIRS[*]}"
		fi
		if [ ${#BACKUP_FILES[@]} -gt 0 ]; then
			echo "  - 파일: ${BACKUP_FILES[*]}"
		fi

		# 백업 실행
		if [ "$DRY_RUN" = false ]; then
			for dir in "${BACKUP_DIRS[@]}"; do
				BACKUP_DIR="${dir}${BACKUP_SUFFIX}"
				print_info "백업 중: $dir → $BACKUP_DIR"
				cp -r "$dir" "$BACKUP_DIR"
			done
			for file in "${BACKUP_FILES[@]}"; do
				BACKUP_FILE="${file}${BACKUP_SUFFIX}"
				print_info "백업 중: $file → $BACKUP_FILE"
				cp -RP "$file" "$BACKUP_FILE"
			done
			total_backup_count=$((${#BACKUP_DIRS[@]} + ${#BACKUP_FILES[@]}))
			print_info "✓ 백업 완료 (${total_backup_count}개 항목)"
		fi
	else
		print_warn "기존 항목이 존재하지만 --no-backup 옵션으로 백업하지 않습니다."
	fi
fi

# 3. Dry-run 모드
if [ "$DRY_RUN" = true ]; then
	print_info "[DRY-RUN] 다음 작업이 수행됩니다:"
	if [ ${#BACKUP_DIRS[@]} -gt 0 ] || [ ${#BACKUP_FILES[@]} -gt 0 ]; then
		echo "  - 백업할 디렉토리: ${BACKUP_DIRS[*]}"
		echo "  - 백업할 파일: ${BACKUP_FILES[*]}"
	fi
	echo "  - GitHub에서 다운로드: $REPO_URL/archive/$BRANCH.zip"
	echo "  - .claude 디렉토리 설치"
	echo "  - .claudeignore 설치/병합"
	echo "  - .agents/skills 심볼릭 링크 구성"
	echo "  - AGENTS.md 심볼릭 링크 구성"
	echo "  - Codex 전역 skills 심볼릭 링크 구성"
	echo "  - browserctl 전역 설치 및 Playwright 런타임 확인"
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

CLAUDEIGNORE_STASH=""
if [ -f ".claudeignore" ]; then
	CLAUDEIGNORE_STASH="$TEMP_DIR/root-claudeignore"
	cp -P ".claudeignore" "$CLAUDEIGNORE_STASH"
fi

# 7. .claude 디렉토리 복사
print_info ".claude 디렉토리 설치 중..."
mkdir -p .claude
cp -r "$TEMP_DIR/claude-settings-$BRANCH/.claude/." .claude/
print_info "✓ 설치 완료"

DOWNLOADED_CLAUDEIGNORE="$TEMP_DIR/claude-settings-$BRANCH/.claudeignore"
if [ -f "$DOWNLOADED_CLAUDEIGNORE" ]; then
	if [ -n "$CLAUDEIGNORE_STASH" ] && [ -f "$CLAUDEIGNORE_STASH" ]; then
		if merge_line_file "$DOWNLOADED_CLAUDEIGNORE" "$CLAUDEIGNORE_STASH" ".claudeignore.merged"; then
			mv ".claudeignore.merged" ".claudeignore"
			print_info "✓ .claudeignore 병합 완료"
		else
			print_warn ".claudeignore 병합 실패, 기본 파일로 설치합니다."
			cp "$DOWNLOADED_CLAUDEIGNORE" ".claudeignore"
		fi
	else
		cp "$DOWNLOADED_CLAUDEIGNORE" ".claudeignore"
		print_info "✓ .claudeignore 설치 완료"
	fi
fi

# 7.1. rules/ 디렉토리의 .ko.md 파일 제거 (토큰 최적화)
# Claude Code는 rules/ 내 모든 .md를 컨텍스트에 로드하므로 한글 파일 제거
ko_count=$(find .claude/rules -name "*.ko.md" -type f 2>/dev/null | wc -l | tr -d ' ')
if [ "$ko_count" -gt 0 ]; then
	find .claude/rules -name "*.ko.md" -type f -delete
	print_info "✓ rules/ 내 .ko.md 파일 ${ko_count}개 제거 (토큰 최적화)"
fi
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

# 7.6. settings.local.json이 없는 경우에만 복사 (있으면 7.5에서 병합됨)
if [ ! -f ".claude/settings.local.json" ]; then
	DOWNLOADED_SETTINGS="$TEMP_DIR/claude-settings-$BRANCH/.claude/settings.local.json"
	if [ -f "$DOWNLOADED_SETTINGS" ]; then
		cp "$DOWNLOADED_SETTINGS" ".claude/settings.local.json"
		print_info "✓ settings.local.json 생성 (새 설치)"
	fi
fi

# 7.7. scripts/ 디렉토리 파일 복사 (항상 최신 버전으로 덮어쓰기)
DOWNLOADED_SCRIPTS="$TEMP_DIR/claude-settings-$BRANCH/.claude/scripts"
if [ -d "$DOWNLOADED_SCRIPTS" ]; then
	mkdir -p ".claude/scripts"
	for script in "$DOWNLOADED_SCRIPTS"/*; do
		if [ -f "$script" ]; then
			script_name=$(basename "$script")
			cp "$script" ".claude/scripts/$script_name"
			print_info "✓ scripts/$script_name 설치"
		fi
	done
fi

# 7.8. .agents/skills + AGENTS.md 브리지 구성
setup_agents_bridge

# 7.9. Codex 전역 skill 링크 구성
setup_codex_skills

# 7.10. Browser runtime bootstrap
setup_browser_runtime

# 9. Memory MCP 전역 설정 (wrapper 스크립트로 동적 경로 지원)
echo ""
print_info "Memory MCP 전역 설정 중..."

# memory.json 파일 초기화 (프로젝트별)
MEMORY_FILE_ABS="$(pwd)/.claude/memory.json"
if [ ! -f "$MEMORY_FILE_ABS" ]; then
	echo '{"entities": [], "relations": []}' > "$MEMORY_FILE_ABS"
	print_info "  └ 메모리 파일 생성됨: $MEMORY_FILE_ABS"
fi

# Wrapper 스크립트를 사용자 홈 디렉토리에 설치 (전역)
GLOBAL_WRAPPER_DIR="$HOME/.claude/scripts"
GLOBAL_WRAPPER="$GLOBAL_WRAPPER_DIR/memory-mcp-wrapper.js"
LOCAL_WRAPPER="$(pwd)/.claude/scripts/memory-mcp-wrapper.js"

mkdir -p "$GLOBAL_WRAPPER_DIR"
if [ -f "$LOCAL_WRAPPER" ]; then
	cp "$LOCAL_WRAPPER" "$GLOBAL_WRAPPER"
	print_info "  └ Wrapper 스크립트 설치됨: $GLOBAL_WRAPPER"
fi

# Windows Git Bash 환경에서는 Windows 형식 경로로 변환
MCP_WRAPPER_PATH="$GLOBAL_WRAPPER"
if [ -f "$GLOBAL_WRAPPER" ] && command -v cygpath &>/dev/null; then
	MCP_WRAPPER_PATH=$(cygpath -w "$GLOBAL_WRAPPER")
	print_info "  └ Windows 경로 변환: $MCP_WRAPPER_PATH"
fi

if command -v claude &>/dev/null; then
	if [ -f "$GLOBAL_WRAPPER" ]; then
		# Memory MCP를 user scope로 추가 (글로벌 wrapper 스크립트 사용)
		memory_result=$(claude mcp add memory -s user -- node "$MCP_WRAPPER_PATH" 2>&1 || true)
		if echo "$memory_result" | grep -qi "already exists"; then
			print_info "  ✓ memory: 이미 존재함 (user)"
		else
			print_info "  ✓ memory: 추가 완료 (user)"
		fi
		print_info "  └ 각 프로젝트의 .claude/memory.json을 자동 사용 (동적 경로)"
		print_info "✓ Memory MCP 전역 설정 완료"
	else
		print_warn "wrapper 스크립트를 찾을 수 없습니다"
		print_info "Fallback: 프로젝트 스코프로 설정합니다."
		fallback_result=$(claude mcp add memory -s project -e "MEMORY_FILE_PATH=$MEMORY_FILE_ABS" -- npx -y @modelcontextprotocol/server-memory 2>&1 || true)
		if echo "$fallback_result" | grep -qi "already exists"; then
			print_info "  ✓ memory: 이미 존재함 (project)"
		else
			print_info "  ✓ memory: 추가 완료 (project)"
		fi
	fi
else
	print_warn "claude 명령어를 찾을 수 없습니다. MCP 설정을 건너뜁니다."
	print_info "Claude Code 설치 후 수동으로 MCP 서버를 추가하세요."
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
	if [ -f "$GLOBAL_WRAPPER" ]; then
		print_info "Codex Memory MCP 전역 설정 중..."
		codex_memory_result=$(codex mcp add memory -- node "$MCP_WRAPPER_PATH" 2>&1 || true)
		if echo "$codex_memory_result" | grep -qi "already exists"; then
			print_info "  ✓ codex memory: 이미 존재함"
		elif echo "$codex_memory_result" | grep -qi "Added"; then
			print_info "  ✓ codex memory: 추가 완료"
		else
			print_warn "  codex memory 등록 결과를 확인해주세요:"
			echo "    $codex_memory_result"
		fi
	else
		print_warn "memory wrapper가 없어 Codex memory MCP 설정을 건너뜁니다."
	fi

	print_info "Codex 로그인 상태 확인 중..."
	codex_status=$(codex login status 2>&1 || true)
	if echo "$codex_status" | grep -qi "logged in"; then
		print_info "✓ Codex 로그인 확인됨"
		
		# Codex MCP를 user scope로 추가 (전역 설정)
		print_info "Codex MCP 전역 설정 중..."
		mcp_result=$(claude mcp add codex -s user -- codex mcp-server 2>&1 || true)
		if echo "$mcp_result" | grep -qi "already exists"; then
			print_info "  ✓ codex: 이미 존재함 (user)"
		else
			print_info "  ✓ codex: 추가 완료 (user)"
		fi
	else
		print_warn "Codex에 로그인되어 있지 않습니다. MCP가 정상 작동하지 않을 수 있습니다."
		echo -e "  ${YELLOW}codex login${NC} 명령어를 실행하여 로그인해주세요."
	fi
fi


# claude-delegator 플러그인 설치 안내
# claude-delegator 플러그인 자동 설치
echo ""
if command -v claude &>/dev/null; then
	print_info "Claude CLI를 사용하여 플러그인 자동 설치 중..."

	# 1. jarrodwatts/claude-delegator 설치
	print_info "  [1/3] claude-delegator 설치..."
	if output=$(claude plugin marketplace add jarrodwatts/claude-delegator 2>&1); then
		print_info "    ✓ Marketplace 추가 성공"
	else
		print_info "    Marketplace 처리: $output"
	fi
	if output=$(claude plugin install claude-delegator 2>&1); then
		print_info "    ✓ claude-delegator 플러그인 설치 성공"
	else
		print_info "    Plugin 설치 처리: $output"
	fi

	# 2. code-simplifier@claude-plugins-official 설치
	print_info "  [2/3] code-simplifier 설치..."
	if output=$(claude plugin install code-simplifier@claude-plugins-official 2>&1); then
		print_info "    ✓ code-simplifier 플러그인 설치 성공"
	else
		print_info "    Plugin 설치 처리: $output"
	fi

	# 3. typescript-lsp@claude-plugins-official 설치
	print_info "  [3/3] typescript-lsp 설치..."
	if output=$(claude plugin install typescript-lsp@claude-plugins-official 2>&1); then
		print_info "    ✓ typescript-lsp 플러그인 설치 성공"
	else
		print_info "    Plugin 설치 처리: $output"
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
	echo "  ✓ .claude/PROJECT.md         (워크스페이스 계약 문서)"
fi
if [ -f ".claudeignore" ]; then
	echo "  ✓ .claudeignore             (기본 ignore/denylist 정책)"
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
if [ -L "AGENTS.md" ]; then
	echo "  ✓ AGENTS.md                  (→ .claude/CLAUDE.md)"
fi
if [ -L ".agents/skills" ]; then
	echo "  ✓ .agents/skills             (→ .claude/skills)"
fi
if [ ${#CODEX_SKILL_LINKS[@]} -gt 0 ]; then
	echo "  ✓ ${CODEX_SKILLS_DIR}/*      (→ .claude/skills/*)"
fi
if [ -x ".claude/bin/browserctl" ]; then
	echo "  ✓ .claude/bin/browserctl     (브라우저 런타임 전역 진입점)"
fi
if [ -d ".claude/tools/browserd" ]; then
	echo "  ✓ .claude/tools/browserd/    (Playwright 브라우저 런타임)"
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

# Suggest generating project bootstrap docs when missing

if [ ! -f ".claude/PROJECT.md" ]; then
	print_warn "PROJECT.md가 없습니다."
	echo "  - 'project-md-refresh' 스킬을 실행해 PROJECT.md와 프로젝트 기준 문서 세트를 생성/갱신하세요."
	echo "  - 예: Claude Code에 이 저장소에서 project-md-refresh를 실행해달라고 요청"
	echo ""
fi

print_warn "다음 단계:"
echo "  1. .claude/PROJECT.md를 프로젝트에 맞게 수정하세요"
echo "  2. Git에 커밋: git add .claude .agents .claudeignore AGENTS.md && git commit -m 'Add Claude settings'"
echo "  3. Codex에서 스킬 목록이 보이지 않으면 새 세션을 열어 ${CODEX_SKILLS_DIR:-\${CODEX_HOME:-~/.codex}/skills} 를 다시 로드하세요"
echo "  4. Claude Code에서 코드 작업을 요청하면 자동으로 PM 워크플로우가 실행됩니다"

if [ ${#BACKUP_DIRS[@]} -gt 0 ] || [ ${#BACKUP_FILES[@]} -gt 0 ] || [ ${#CODEX_BACKUP_PATHS[@]} -gt 0 ]; then
	echo ""
	print_info "백업된 항목:"
	for dir in "${BACKUP_DIRS[@]}"; do
		BACKUP_DIR="${dir}${BACKUP_SUFFIX}"
		if [ -d "$BACKUP_DIR" ]; then
			echo "  ✓ $BACKUP_DIR"
			echo "    복원: mv $BACKUP_DIR $dir"
		fi
	done
	for file in "${BACKUP_FILES[@]}"; do
		BACKUP_FILE="${file}${BACKUP_SUFFIX}"
		if [ -e "$BACKUP_FILE" ]; then
			echo "  ✓ $BACKUP_FILE"
			echo "    복원: mv $BACKUP_FILE $file"
		fi
	done
	for path in "${CODEX_BACKUP_PATHS[@]}"; do
		if [ -e "$path" ] || [ -L "$path" ]; then
			echo "  ✓ $path"
			echo "    복원: mv $path ${path%"$BACKUP_SUFFIX"}"
		fi
	done
fi
