#!/bin/bash
# Lightweight knowledge repository audit:
# - required docs exist
# - local markdown links are valid
# - review metadata freshness is within policy
# - always-loaded context budget is within limits
# - PROJECT placeholders can be optionally enforced
# - duplicated rule lines are flagged

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_ID="knowledge-audit-$(date +%Y%m%d-%H%M%S)"
OUT_FILE="${HARNESS_KNOWLEDGE_AUDIT_FILE:-$ROOT_DIR/.claude/knowledge-repo-audit-${RUN_ID}.json}"
REVIEW_MAX_DAYS="${KNOWLEDGE_REVIEW_MAX_DAYS:-45}"
ALWAYS_LOADED_RULE_LINE_MAX="${KNOWLEDGE_ALWAYS_LOADED_RULE_LINE_MAX:-250}"
ALWAYS_LOADED_TOTAL_LINE_MAX="${KNOWLEDGE_ALWAYS_LOADED_TOTAL_LINE_MAX:-320}"
ALWAYS_LOADED_TOKEN_MAX="${KNOWLEDGE_ALWAYS_LOADED_TOKEN_MAX:-2200}"
REQUIRE_PROJECT_FILLED="${KNOWLEDGE_REQUIRE_PROJECT_FILLED:-false}"

declare -a ERRORS=()
declare -a WARNINGS=()
declare -a BROKEN_LINKS=()
declare -a STALE_DOCS=()
declare -a MISSING_REVIEW_DATE=()
declare -a CONTEXT_BUDGET_VIOLATIONS=()
declare -a PROJECT_PLACEHOLDER_HITS=()
declare -a DUPLICATE_RULE_LINES=()
declare -a RULE_FILES=()

ALWAYS_LOADED_RULE_LINES=0
ALWAYS_LOADED_TOTAL_LINES=0
ALWAYS_LOADED_EST_TOKENS=0

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

to_epoch() {
  local iso_date="$1"
  if date -d "$iso_date" "+%s" >/dev/null 2>&1; then
    date -d "$iso_date" "+%s"
    return 0
  fi

  if date -j -f "%Y-%m-%d" "$iso_date" "+%s" >/dev/null 2>&1; then
    date -j -f "%Y-%m-%d" "$iso_date" "+%s"
    return 0
  fi

  return 1
}

append_json_array() {
  local array_name="$1"
  local items=()
  local items_count=0
  local first=true
  local item
  eval "items_count=\${#${array_name}[@]}"
  if [ "$items_count" -eq 0 ]; then
    return 0
  fi
  eval "items=(\"\${${array_name}[@]}\")"
  for item in "${items[@]:-}"; do
    if [ "$first" = true ]; then
      first=false
    else
      printf ','
    fi
    printf '"%s"' "$(json_escape "$item")"
  done
}

extract_last_reviewed() {
  local file="$1"
  local line
  line="$(grep -Eim1 '^(Last-Reviewed|lastReviewed):' "$file" || true)"
  if [ -z "$line" ]; then
    printf ''
    return 0
  fi

  printf '%s' "$line" | sed -E 's/^[^:]+:[[:space:]]*//'
}

require_file() {
  local rel="$1"
  local abs="$ROOT_DIR/$rel"
  if [ ! -e "$abs" ]; then
    ERRORS+=("Missing required file: $rel")
  fi
}

load_rule_files() {
  RULE_FILES=()
  while IFS= read -r file; do
    RULE_FILES+=("$file")
  done < <(find "$ROOT_DIR/.claude/rules" -type f -name '*.md' | sort)
}

check_links_in_file() {
  local file="$1"
  local base_dir
  local link
  local target
  local abs_target

  base_dir="$(cd "$(dirname "$file")" && pwd)"

  while IFS= read -r link; do
    target="${link%%#*}"
    if [ -z "$target" ]; then
      continue
    fi
    if [[ "$target" =~ ^https?:// ]] || [[ "$target" =~ ^mailto: ]] || [[ "$target" =~ ^# ]]; then
      continue
    fi
    if [[ "$target" =~ ^[a-zA-Z][a-zA-Z0-9+.-]*: ]]; then
      continue
    fi

    if [[ "$target" == /* ]]; then
      abs_target="$target"
    else
      abs_target="$base_dir/$target"
    fi

    if [ ! -e "$abs_target" ]; then
      BROKEN_LINKS+=("${file#$ROOT_DIR/} -> $target")
    fi
  done < <(grep -oE '\[[^]]+\]\(([^)]+)\)' "$file" | sed -E 's/.*\(([^)]+)\)/\1/' || true)
}

check_review_freshness() {
  local rel="$1"
  local file="$ROOT_DIR/$rel"
  local last_reviewed
  local now_epoch
  local reviewed_epoch
  local age_days

  if [ ! -f "$file" ]; then
    return 0
  fi

  last_reviewed="$(extract_last_reviewed "$file")"
  if [ -z "$last_reviewed" ]; then
    MISSING_REVIEW_DATE+=("$rel")
    return 0
  fi

  now_epoch="$(date +%s)"
  reviewed_epoch="$(to_epoch "$last_reviewed" || true)"
  if [ -z "$reviewed_epoch" ]; then
    WARNINGS+=("Invalid review date in $rel: $last_reviewed")
    return 0
  fi

  age_days=$(( (now_epoch - reviewed_epoch) / 86400 ))
  if [ "$age_days" -gt "$REVIEW_MAX_DAYS" ]; then
    STALE_DOCS+=("$rel ($age_days days old)")
  fi
}

check_always_loaded_budget() {
  local claude_file="$ROOT_DIR/.claude/CLAUDE.md"
  local file
  local line_count
  local char_count
  local rule_lines=0
  local rule_chars=0
  local claude_lines=0
  local claude_chars=0

  if [ ! -f "$claude_file" ]; then
    return 0
  fi

  for file in "${RULE_FILES[@]}"; do
    line_count="$(wc -l < "$file" | tr -d ' ')"
    char_count="$(wc -m < "$file" | tr -d ' ')"
    rule_lines=$((rule_lines + line_count))
    rule_chars=$((rule_chars + char_count))
  done

  claude_lines="$(wc -l < "$claude_file" | tr -d ' ')"
  claude_chars="$(wc -m < "$claude_file" | tr -d ' ')"

  ALWAYS_LOADED_RULE_LINES="$rule_lines"
  ALWAYS_LOADED_TOTAL_LINES=$((rule_lines + claude_lines))
  ALWAYS_LOADED_EST_TOKENS=$(( (rule_chars + claude_chars + 3) / 4 ))

  if [ "$ALWAYS_LOADED_RULE_LINES" -gt "$ALWAYS_LOADED_RULE_LINE_MAX" ]; then
    CONTEXT_BUDGET_VIOLATIONS+=(
      "rules lines ${ALWAYS_LOADED_RULE_LINES} > ${ALWAYS_LOADED_RULE_LINE_MAX}"
    )
  fi

  if [ "$ALWAYS_LOADED_TOTAL_LINES" -gt "$ALWAYS_LOADED_TOTAL_LINE_MAX" ]; then
    CONTEXT_BUDGET_VIOLATIONS+=(
      "always-loaded total lines ${ALWAYS_LOADED_TOTAL_LINES} > ${ALWAYS_LOADED_TOTAL_LINE_MAX}"
    )
  fi

  if [ "$ALWAYS_LOADED_EST_TOKENS" -gt "$ALWAYS_LOADED_TOKEN_MAX" ]; then
    CONTEXT_BUDGET_VIOLATIONS+=(
      "always-loaded estimated tokens ${ALWAYS_LOADED_EST_TOKENS} > ${ALWAYS_LOADED_TOKEN_MAX}"
    )
  fi

  if [ "${#CONTEXT_BUDGET_VIOLATIONS[@]}" -gt 0 ]; then
    ERRORS+=("Always-loaded context budget exceeded")
  fi
}

check_project_placeholders() {
  local files=(
    "$ROOT_DIR/.claude/PROJECT.md"
    "$ROOT_DIR/.claude/PROJECT.ko.md"
  )
  local markers=(
    "[service/product name and short description]"
    "[tech stack - see guide below]"
    "[default response language]"
    "[project root]/"
    "[main folder1]/"
    "[main folder2]/"
    "[main folder3]/"
    "[feature folder pattern example]"
    "[API routing rules]"
    "[commonly used utilities]"
    "[how clients call APIs]"
    "[type file locations and naming rules]"
    "[Entity, DTO, Request/Response structures]"
    "[JWT, session, etc.]"
    "[permission management approach]"
    "[auth/authorization middleware locations]"
    "[dev server command]"
    "[build command]"
    "[lint command]"
    "[typecheck command]"
    "[test command]"
    "[ENV_NAME]"
    "This file is a per-project template"
    "[서비스/제품 이름 및 간단한 설명]"
    "[기술 스택 - 아래 가이드 참고]"
    "[기본 응답 언어 지정]"
    "[프로젝트 루트]/"
    "[주요 폴더1]/"
    "[주요 폴더2]/"
    "[주요 폴더3]/"
    "[기능 폴더 패턴 예시]"
    "[API 라우트 규칙]"
    "[자주 사용하는 유틸리티 함수]"
    "[클라이언트에서 API 호출 방식]"
    "[타입 파일 위치 및 명명 규칙]"
    "[Entity, DTO, Request/Response 구조]"
    "[JWT, Session 등]"
    "[권한 관리 방식]"
    "[인증/권한 처리 미들웨어 위치]"
    "[개발 서버 실행 명령]"
    "[빌드 명령]"
    "[린트 명령]"
    "[타입 체크 명령]"
    "[테스트 실행 명령]"
    "[환경 변수명]"
    "프로젝트별로 작성해야 하는 템플릿"
  )
  local file
  local marker
  local rel

  for file in "${files[@]}"; do
    if [ ! -f "$file" ]; then
      continue
    fi

    rel="${file#$ROOT_DIR/}"
    for marker in "${markers[@]}"; do
      if grep -Fq "$marker" "$file"; then
        PROJECT_PLACEHOLDER_HITS+=("$rel -> $marker")
      fi
    done

    while IFS= read -r line; do
      PROJECT_PLACEHOLDER_HITS+=("$rel -> generic placeholder at $line")
    done < <(grep -nE '^\s*[-*]?\s*\*\*[^*]+\*\*:\s*\[[^]]+\]\s*$' "$file" || true)
  done

  if [ "${#PROJECT_PLACEHOLDER_HITS[@]}" -gt 0 ] && [ "$REQUIRE_PROJECT_FILLED" = "true" ]; then
    ERRORS+=("PROJECT template placeholders found: ${#PROJECT_PLACEHOLDER_HITS[@]}")
  fi
}

check_duplicate_rule_lines() {
  local tmp
  local count
  local text
  local line

  if [ "${#RULE_FILES[@]}" -eq 0 ]; then
    return 0
  fi

  tmp="$(mktemp)"

  awk '
    BEGIN { in_code=0; in_frontmatter=0; }
    FNR==1 { in_frontmatter=0 }
    /^---$/ {
      if (FNR==1) { in_frontmatter=1; next }
      if (in_frontmatter==1) { in_frontmatter=0; next }
    }
    in_frontmatter==1 { next }
    /^```/ { in_code = !in_code; next }
    in_code==1 { next }
    {
      line=$0
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", line)
      if (line=="" || line ~ /^#/) next
      gsub(/^[-*][[:space:]]+/, "", line)
      gsub(/`/, "", line)
      lower=tolower(line)
      gsub(/[[:space:]]+/, " ", lower)
      gsub(/[[:space:]]+$/, "", lower)
      if (length(lower) < 30) next
      print lower
    }
  ' "${RULE_FILES[@]}" | sort | uniq -c | sort -nr > "$tmp"

  while IFS= read -r line; do
    count="$(printf '%s' "$line" | awk '{print $1}')"
    if [ -z "$count" ] || [ "$count" -le 1 ]; then
      continue
    fi
    text="$(printf '%s' "$line" | sed -E 's/^[[:space:]]*[0-9]+[[:space:]]+//')"
    DUPLICATE_RULE_LINES+=("$count x $text")
    if [ "${#DUPLICATE_RULE_LINES[@]}" -ge 10 ]; then
      break
    fi
  done < "$tmp"

  rm -f "$tmp"

  if [ "${#DUPLICATE_RULE_LINES[@]}" -gt 0 ]; then
    WARNINGS+=("Potential duplicated rule lines found: ${#DUPLICATE_RULE_LINES[@]}")
  fi
}

main() {
  mkdir -p "$ROOT_DIR/.claude"
  load_rule_files

  local required_files=(
    "AGENTS.md"
    ".claude/CLAUDE.md"
    ".claude/PROJECT.md"
    ".claude/docs/guidelines/document-memory-policy.md"
    ".claude/docs/guidelines/knowledge-repository-ops.md"
  )

  local link_scan_files=(
    ".claude/CLAUDE.md"
    ".claude/CLAUDE.ko.md"
    ".claude/PROJECT.md"
    ".claude/PROJECT.ko.md"
    ".claude/docs/guidelines/knowledge-repository-ops.md"
    ".claude/docs/guidelines/knowledge-repository-ops.ko.md"
  )

  local freshness_files=(
    ".claude/CLAUDE.md"
    ".claude/CLAUDE.ko.md"
    ".claude/PROJECT.md"
    ".claude/PROJECT.ko.md"
    ".claude/docs/guidelines/knowledge-repository-ops.md"
    ".claude/docs/guidelines/knowledge-repository-ops.ko.md"
  )

  local rel
  for rel in "${required_files[@]}"; do
    require_file "$rel"
  done

  for rel in "${link_scan_files[@]}"; do
    if [ -f "$ROOT_DIR/$rel" ]; then
      check_links_in_file "$ROOT_DIR/$rel"
    fi
  done

  for rel in "${freshness_files[@]}"; do
    check_review_freshness "$rel"
  done

  check_always_loaded_budget
  check_project_placeholders
  check_duplicate_rule_lines

  if [ "${#MISSING_REVIEW_DATE[@]}" -gt 0 ]; then
    WARNINGS+=("Missing Last-Reviewed metadata in ${#MISSING_REVIEW_DATE[@]} file(s)")
  fi

  if [ "${#BROKEN_LINKS[@]}" -gt 0 ]; then
    ERRORS+=("Broken local links found: ${#BROKEN_LINKS[@]}")
  fi

  if [ "${#STALE_DOCS[@]}" -gt 0 ]; then
    WARNINGS+=("Stale documents found: ${#STALE_DOCS[@]}")
  fi

  local verdict="passed"
  local exit_code=0
  if [ "${#ERRORS[@]}" -gt 0 ]; then
    verdict="failed"
    exit_code=1
  fi

  {
    printf '{\n'
    printf '  "runId": "%s",\n' "$RUN_ID"
    printf '  "script": "knowledge-repo-audit.sh",\n'
    printf '  "generatedAt": "%s",\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    printf '  "verdict": "%s",\n' "$verdict"
    printf '  "exitCode": %s,\n' "$exit_code"
    printf '  "policy": {\n'
    printf '    "reviewMaxDays": %s,\n' "$REVIEW_MAX_DAYS"
    printf '    "alwaysLoadedRuleLineMax": %s,\n' "$ALWAYS_LOADED_RULE_LINE_MAX"
    printf '    "alwaysLoadedTotalLineMax": %s,\n' "$ALWAYS_LOADED_TOTAL_LINE_MAX"
    printf '    "alwaysLoadedTokenMax": %s,\n' "$ALWAYS_LOADED_TOKEN_MAX"
    printf '    "requireProjectFilled": "%s"\n' "$REQUIRE_PROJECT_FILLED"
    printf '  },\n'
    printf '  "metrics": {\n'
    printf '    "alwaysLoadedRuleLines": %s,\n' "$ALWAYS_LOADED_RULE_LINES"
    printf '    "alwaysLoadedTotalLines": %s,\n' "$ALWAYS_LOADED_TOTAL_LINES"
    printf '    "alwaysLoadedEstimatedTokens": %s\n' "$ALWAYS_LOADED_EST_TOKENS"
    printf '  },\n'
    printf '  "summary": {\n'
    printf '    "errors": %s,\n' "${#ERRORS[@]}"
    printf '    "warnings": %s,\n' "${#WARNINGS[@]}"
    printf '    "brokenLinks": %s,\n' "${#BROKEN_LINKS[@]}"
    printf '    "staleDocs": %s,\n' "${#STALE_DOCS[@]}"
    printf '    "missingReviewDate": %s,\n' "${#MISSING_REVIEW_DATE[@]}"
    printf '    "contextBudgetViolations": %s,\n' "${#CONTEXT_BUDGET_VIOLATIONS[@]}"
    printf '    "projectPlaceholderHits": %s,\n' "${#PROJECT_PLACEHOLDER_HITS[@]}"
    printf '    "duplicateRuleLines": %s\n' "${#DUPLICATE_RULE_LINES[@]}"
    printf '  },\n'
    printf '  "details": {\n'
    printf '    "errors": ['; append_json_array ERRORS; printf '],\n'
    printf '    "warnings": ['; append_json_array WARNINGS; printf '],\n'
    printf '    "brokenLinks": ['; append_json_array BROKEN_LINKS; printf '],\n'
    printf '    "staleDocs": ['; append_json_array STALE_DOCS; printf '],\n'
    printf '    "missingReviewDate": ['; append_json_array MISSING_REVIEW_DATE; printf '],\n'
    printf '    "contextBudgetViolations": ['; append_json_array CONTEXT_BUDGET_VIOLATIONS; printf '],\n'
    printf '    "projectPlaceholderHits": ['; append_json_array PROJECT_PLACEHOLDER_HITS; printf '],\n'
    printf '    "duplicateRuleLines": ['; append_json_array DUPLICATE_RULE_LINES; printf ']\n'
    printf '  }\n'
    printf '}\n'
  } > "$OUT_FILE"

  echo ""
  echo "Knowledge Repo Audit"
  echo "Run ID: $RUN_ID"
  echo "Verdict: $verdict"
  echo "Errors: ${#ERRORS[@]} / Warnings: ${#WARNINGS[@]}"
  echo "Always-loaded lines (rules/total): ${ALWAYS_LOADED_RULE_LINES}/${ALWAYS_LOADED_TOTAL_LINES}"
  echo "Always-loaded estimated tokens: ${ALWAYS_LOADED_EST_TOKENS}"
  echo "Artifact: $OUT_FILE"
  echo ""

  exit "$exit_code"
}

main "$@"
