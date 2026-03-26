#!/usr/bin/env bash

# Enforce machine-checkable code policy rules on changed source files.
# Default rules:
#   - no files over VERIFY_CODE_POLICY_MAX_FILE_LINES (default: 800)
#   - no console.log statements in JS/TS sources
#   - no TODO/FIXME without an issue reference

set -euo pipefail

MAX_FILE_LINES="${VERIFY_CODE_POLICY_MAX_FILE_LINES:-800}"
BASELINE_FILE="${VERIFY_CODE_POLICY_BASELINE_FILE:-.claude/code-policy-baseline.txt}"

collect_candidate_files() {
  if [ -n "${VERIFY_CODE_POLICY_FILES:-}" ]; then
    printf '%s\n' "${VERIFY_CODE_POLICY_FILES}"
    return 0
  fi

  if [ "$#" -gt 0 ]; then
    printf '%s\n' "$@"
    return 0
  fi

  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git status --short 2>/dev/null | while IFS= read -r line; do
      path="${line#?? }"
      path="${path##* -> }"
      [ -n "$path" ] || continue
      printf '%s\n' "$path"
    done
    return 0
  fi

  find . -type f
}

CANDIDATE_FILES="$(collect_candidate_files "$@")"

if [ -z "$CANDIDATE_FILES" ]; then
  echo "Code policy check: no candidate files found"
  exit 0
fi

FILES_TEXT="$CANDIDATE_FILES" \
VERIFY_CODE_POLICY_MAX_FILE_LINES="$MAX_FILE_LINES" \
VERIFY_CODE_POLICY_BASELINE_FILE="$BASELINE_FILE" \
python3 - <<'PY'
import os
import re
import sys
from pathlib import Path


MAX_FILE_LINES = int(os.environ["VERIFY_CODE_POLICY_MAX_FILE_LINES"])
FILES = [line.strip() for line in os.environ.get("FILES_TEXT", "").splitlines() if line.strip()]
BASELINE_FILE = Path(os.environ["VERIFY_CODE_POLICY_BASELINE_FILE"])

SUPPORTED_SUFFIXES = {
    ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
    ".py", ".rb", ".go", ".rs", ".java", ".kt", ".kts",
    ".cs", ".php", ".swift", ".scala", ".sh", ".bash",
    ".zsh", ".ps1", ".psm1", ".c", ".cc", ".cpp", ".cxx",
    ".h", ".hh", ".hpp", ".hxx",
}
CONSOLE_LOG_SUFFIXES = {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"}
SKIP_PARTS = {
    ".git", "node_modules", "dist", "build", "coverage", ".next",
    ".turbo", ".cache", "vendor", "target", "out",
}
SKIP_SUFFIXES = {
    ".min.js", ".min.cjs", ".min.mjs", ".bundle.js", ".generated.js",
    ".generated.ts", ".generated.tsx",
}

console_log_pattern = re.compile(r"\bconsole\.log\s*\(")
todo_pattern = re.compile(r"\b(TODO|FIXME)\b", re.IGNORECASE)
issue_ref_pattern = re.compile(
    r"(#\d+|[A-Z][A-Z0-9]+-\d+|https?://|issue[: -]?\d+|gh-\d+)",
    re.IGNORECASE,
)


def normalize(path_str: str) -> Path:
    return Path(path_str)


def should_skip(path: Path) -> bool:
    if any(part in SKIP_PARTS for part in path.parts):
        return True
    path_text = path.as_posix()
    return any(path_text.endswith(suffix) for suffix in SKIP_SUFFIXES)


def is_supported(path: Path) -> bool:
    suffix = path.suffix.lower()
    if suffix in SUPPORTED_SUFFIXES:
        return True
    return path.name.lower() in {"bashrc", "zshrc"}


def is_console_log_target(path: Path) -> bool:
    return path.suffix.lower() in CONSOLE_LOG_SUFFIXES


def read_lines(path: Path):
    try:
        return path.read_text(encoding="utf-8").splitlines()
    except UnicodeDecodeError:
        return path.read_text(encoding="utf-8", errors="ignore").splitlines()


def normalize_rule_path(path: Path) -> str:
    return path.as_posix().lstrip("./")


def load_baseline() -> set[tuple[str, str]]:
    if not BASELINE_FILE.exists():
        return set()

    entries: set[tuple[str, str]] = set()
    for raw_line in BASELINE_FILE.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        rule, sep, path = line.partition("|")
        if not sep:
            continue
        entries.add((rule.strip(), path.strip().lstrip("./")))
    return entries


def is_baselined(rule: str, path: Path, baseline: set[tuple[str, str]]) -> bool:
    return (rule, normalize_rule_path(path)) in baseline


def has_todo_comment(line: str) -> bool:
    match = todo_pattern.search(line)
    if not match:
        return False

    if (match.start() > 0 and line[match.start() - 1] == "/") or (
        match.end() < len(line) and line[match.end()] == "/"
    ):
        return False

    prefix = line[: match.start()]
    stripped_prefix = prefix.rstrip()
    if not stripped_prefix:
        return True

    comment_markers = ("#", "//", "/*", "*", "--", ";", "<!--")
    return any(marker in stripped_prefix for marker in comment_markers)


checked_files = []
violations = []
baseline = load_baseline()

for raw_path in FILES:
    path = normalize(raw_path)
    if not path.exists() or not path.is_file():
        continue
    if should_skip(path) or not is_supported(path):
        continue

    checked_files.append(path.as_posix())
    lines = read_lines(path)

    if len(lines) > MAX_FILE_LINES and not is_baselined("file-length", path, baseline):
        violations.append(
            f"[file-length] {path.as_posix()}: {len(lines)} lines > {MAX_FILE_LINES}"
        )

    if is_console_log_target(path):
        for line_no, line in enumerate(lines, start=1):
            if console_log_pattern.search(line) and not is_baselined("console-log", path, baseline):
                violations.append(
                    f"[console-log] {path.as_posix()}:{line_no}: {line.strip()}"
                )

    for line_no, line in enumerate(lines, start=1):
        if has_todo_comment(line) and not issue_ref_pattern.search(line) and not is_baselined("todo-reference", path, baseline):
            violations.append(
                f"[todo-reference] {path.as_posix()}:{line_no}: {line.strip()}"
            )

if not checked_files:
    print("Code policy check: no supported changed code files found")
    sys.exit(0)

print("Code Policy Check")
print(f"Checked files: {len(checked_files)}")
print(f"Max file lines: {MAX_FILE_LINES}")

if violations:
    print(f"Violations: {len(violations)}")
    for item in violations:
        print(f"- {item}")
    sys.exit(1)

print("Violations: 0")
sys.exit(0)
PY
