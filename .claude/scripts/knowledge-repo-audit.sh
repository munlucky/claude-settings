#!/bin/bash
# Lightweight knowledge repository audit:
# - required docs exist
# - local markdown links are valid
# - review metadata freshness is within policy

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_ID="knowledge-audit-$(date +%Y%m%d-%H%M%S)"
OUT_FILE="${HARNESS_KNOWLEDGE_AUDIT_FILE:-$ROOT_DIR/.claude/knowledge-repo-audit-${RUN_ID}.json}"
REVIEW_MAX_DAYS="${KNOWLEDGE_REVIEW_MAX_DAYS:-45}"

declare -a ERRORS=()
declare -a WARNINGS=()
declare -a BROKEN_LINKS=()
declare -a STALE_DOCS=()
declare -a MISSING_REVIEW_DATE=()

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

main() {
  mkdir -p "$ROOT_DIR/.claude"

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
    printf '    "reviewMaxDays": %s\n' "$REVIEW_MAX_DAYS"
    printf '  },\n'
    printf '  "summary": {\n'
    printf '    "errors": %s,\n' "${#ERRORS[@]}"
    printf '    "warnings": %s,\n' "${#WARNINGS[@]}"
    printf '    "brokenLinks": %s,\n' "${#BROKEN_LINKS[@]}"
    printf '    "staleDocs": %s,\n' "${#STALE_DOCS[@]}"
    printf '    "missingReviewDate": %s\n' "${#MISSING_REVIEW_DATE[@]}"
    printf '  },\n'
    printf '  "details": {\n'
    printf '    "errors": ['; append_json_array ERRORS; printf '],\n'
    printf '    "warnings": ['; append_json_array WARNINGS; printf '],\n'
    printf '    "brokenLinks": ['; append_json_array BROKEN_LINKS; printf '],\n'
    printf '    "staleDocs": ['; append_json_array STALE_DOCS; printf '],\n'
    printf '    "missingReviewDate": ['; append_json_array MISSING_REVIEW_DATE; printf ']\n'
    printf '  }\n'
    printf '}\n'
  } > "$OUT_FILE"

  echo ""
  echo "Knowledge Repo Audit"
  echo "Run ID: $RUN_ID"
  echo "Verdict: $verdict"
  echo "Errors: ${#ERRORS[@]} / Warnings: ${#WARNINGS[@]}"
  echo "Artifact: $OUT_FILE"
  echo ""

  exit "$exit_code"
}

main "$@"
