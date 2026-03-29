#!/usr/bin/env bash
set -euo pipefail
WORKFLOW_LOG_DIR="${WORKFLOW_ENFORCEMENT_LOG_DIR:-.claude/logs/workflow-enforcement}"
STATUS_FILE_DEFAULT=".claude/docs/phase-status.yaml"
usage() {
  cat <<'EOF_USAGE'
Usage:
  workflow-enforcement.sh record-dispatch --plan-dir <path> --execution-mode <mode> --execution-root <path> --runtime <runtime> [--status-file <path>] [--master-plan <path>]
  workflow-enforcement.sh record-bounded --analysis-path <path> [--qa-report-path <path>] [--handoff-path <path>]
  workflow-enforcement.sh verify [changed-files...]
EOF_USAGE
}
log_error() {
  printf 'ERROR: %s\n' "$1" >&2
}
collect_candidate_files() {
  if [ -n "${WORKFLOW_ENFORCEMENT_FILES:-}" ]; then
    printf '%s\n' "${WORKFLOW_ENFORCEMENT_FILES}"
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
}
record_dispatch() {
  local plan_dir=""
  local execution_mode=""
  local execution_root=""
  local runtime=""
  local status_file="$STATUS_FILE_DEFAULT"
  local master_plan=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --plan-dir)
        plan_dir="$2"
        shift 2
        ;;
      --execution-mode)
        execution_mode="$2"
        shift 2
        ;;
      --execution-root)
        execution_root="$2"
        shift 2
        ;;
      --runtime)
        runtime="$2"
        shift 2
        ;;
      --status-file)
        status_file="$2"
        shift 2
        ;;
      --master-plan)
        master_plan="$2"
        shift 2
        ;;
      *)
        log_error "Unknown record-dispatch option: $1"
        usage
        exit 1
        ;;
    esac
  done
  if [[ -z "$plan_dir" || -z "$execution_mode" || -z "$execution_root" || -z "$runtime" ]]; then
    log_error "record-dispatch requires --plan-dir, --execution-mode, --execution-root, and --runtime"
    exit 1
  fi
  mkdir -p "$WORKFLOW_LOG_DIR"
  local timestamp
  timestamp="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  local stamp
  stamp="$(date -u '+%Y%m%d-%H%M%S')"
  local log_file="${WORKFLOW_LOG_DIR}/dispatch-${stamp}.json"
  local latest_file="${WORKFLOW_LOG_DIR}/latest-dispatch.json"
  PLAN_DIR_VALUE="$plan_dir" \
  EXECUTION_MODE_VALUE="$execution_mode" \
  EXECUTION_ROOT_VALUE="$execution_root" \
  RUNTIME_VALUE="$runtime" \
  STATUS_FILE_VALUE="$status_file" \
  MASTER_PLAN_VALUE="$master_plan" \
  TIMESTAMP_VALUE="$timestamp" \
  LOG_FILE_VALUE="$log_file" \
  LATEST_FILE_VALUE="$latest_file" \
  python3 - <<'PY'
import json
import os
from pathlib import Path
payload = {
    "evidenceVersion": "1.0",
    "recordedAt": os.environ["TIMESTAMP_VALUE"],
    "source": "moonshot-phase-dispatch",
    "publicEntrypoint": "moonshot-phase-runner",
    "planDir": os.environ["PLAN_DIR_VALUE"],
    "statusFile": os.environ["STATUS_FILE_VALUE"],
    "masterPlan": os.environ["MASTER_PLAN_VALUE"],
    "executionMode": os.environ["EXECUTION_MODE_VALUE"],
    "executionRoot": os.environ["EXECUTION_ROOT_VALUE"],
    "runtime": os.environ["RUNTIME_VALUE"],
    "selectedBundles": [
        "ready-isolate-bundle",
        "implementation-bundle",
        "review-bundle",
        "verification-bundle",
        "finish-bundle",
    ],
    "requiredSkills": [
        "moonshot-phase-runner",
        "moonshot-phase-executor",
        "implementation-runner",
        "codex-review-code",
        "code-simplifier",
        "completion-verifier",
        "doc-auto-sync",
        "session-logger",
    ],
    "stageOrder": [
        "ready/isolate",
        "execute",
        "review",
        "verify",
        "finish/handoff",
    ],
    "notes": [
        "Large or phase-based work must enter through moonshot-phase-runner.",
        "Meaningful code changes require review evidence before verification and completion.",
        "Finish or handoff can only begin after review and verification reach a stable state.",
        "Incomplete phase stops require session-logger evidence in handoff artifacts.",
    ],
}
for target in (Path(os.environ["LOG_FILE_VALUE"]), Path(os.environ["LATEST_FILE_VALUE"])):
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
PY
  if [[ -f "$status_file" ]]; then
    STATUS_FILE_VALUE="$status_file" \
    TIMESTAMP_VALUE="$timestamp" \
    LATEST_FILE_VALUE="$latest_file" \
    python3 - <<'PY'
import os
from pathlib import Path
status_file = Path(os.environ["STATUS_FILE_VALUE"])
lines = status_file.read_text(encoding="utf-8").splitlines()
updates = {
    "lastDispatchAt": f'"{os.environ["TIMESTAMP_VALUE"]}"',
    "workflowEvidenceFile": f'"{os.environ["LATEST_FILE_VALUE"]}"',
    "workflowSelectedBundles": '"ready-isolate-bundle,implementation-bundle,review-bundle,verification-bundle,finish-bundle"',
    'workflowRequiredSkills': '"moonshot-phase-runner,moonshot-phase-executor,implementation-runner,codex-review-code,code-simplifier,completion-verifier,doc-auto-sync,session-logger"',
}
insert_at = len(lines)
for idx, line in enumerate(lines):
    if line.startswith("phases:"):
        insert_at = idx
        break
for key, value in updates.items():
    prefix = f"{key}:"
    replaced = False
    for idx, line in enumerate(lines):
        if line.startswith(prefix):
            lines[idx] = f"{prefix} {value}"
            replaced = True
            break
    if not replaced:
        lines.insert(insert_at, f"{prefix} {value}")
        insert_at += 1
status_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY
  fi
  printf 'Workflow enforcement dispatch recorded: %s\n' "$log_file"
}
record_bounded() {
  local analysis_path=""
  local qa_report_path=""
  local handoff_path=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --analysis-path)
        analysis_path="$2"
        shift 2
        ;;
      --qa-report-path)
        qa_report_path="$2"
        shift 2
        ;;
      --handoff-path)
        handoff_path="$2"
        shift 2
        ;;
      *)
        log_error "Unknown record-bounded option: $1"
        usage
        exit 1
        ;;
    esac
  done
  if [[ -z "$analysis_path" ]]; then
    log_error "record-bounded requires --analysis-path"
    exit 1
  fi
  mkdir -p "$WORKFLOW_LOG_DIR"
  local timestamp
  timestamp="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  local log_file="${WORKFLOW_LOG_DIR}/latest-bounded.json"
  ANALYSIS_PATH_VALUE="$analysis_path" \
  QA_REPORT_PATH_VALUE="$qa_report_path" \
  HANDOFF_PATH_VALUE="$handoff_path" \
  TIMESTAMP_VALUE="$timestamp" \
  LOG_FILE_VALUE="$log_file" \
  python3 - <<'PY'
import json
import os
from pathlib import Path
analysis_path = Path(os.environ["ANALYSIS_PATH_VALUE"])
qa_report_value = os.environ["QA_REPORT_PATH_VALUE"].strip()
handoff_value = os.environ["HANDOFF_PATH_VALUE"].strip()
qa_report_path = Path(qa_report_value) if qa_report_value else None
selected_bundles = [
    "analysis-bundle",
    "ready-isolate-bundle",
    "implementation-bundle",
    "review-bundle",
    "verification-bundle",
    "finish-bundle",
]
required_skills = [
    "implementation-runner",
    "codex-review-code",
    "code-simplifier",
    "completion-verifier",
    "doc-auto-sync",
    "session-logger",
]
stage_order = [
    "plan",
    "ready/isolate",
    "execute",
    "review",
    "verify",
    "finish/handoff",
]
def yaml_scalar(value):
    if value is None or value == "":
        return "null"
    escaped = str(value).replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'
def extract_workflow_section(text: str):
    lines = text.splitlines()
    start = None
    for idx, line in enumerate(lines):
        if line.strip() == "## Workflow Execution":
            start = idx + 1
            break
    if start is None:
        return {}
    section = {}
    for line in lines[start:]:
        if line.startswith("## "):
            break
        stripped = line.strip()
        if stripped.startswith("- Selected bundles:"):
            section["selected"] = stripped.split(":", 1)[1].strip()
        elif stripped.startswith("- Applied skills:"):
            section["applied"] = stripped.split(":", 1)[1].strip()
        elif stripped.startswith("- Skipped skills:"):
            section["skipped"] = stripped.split(":", 1)[1].strip()
    return section
def parse_list_string(value: str):
    return [item.strip() for item in value.split(",") if item.strip()]
def parse_simple_yaml(text: str):
    result = {}
    stack = [(-1, result)]
    lines = text.splitlines()
    def parse_scalar(value: str):
        raw = value.strip()
        if raw in {"true", "false"}:
            return raw == "true"
        if raw == "null":
            return None
        if (raw.startswith('"') and raw.endswith('"')) or (raw.startswith("'") and raw.endswith("'")):
            return raw[1:-1]
        return raw
    def next_meaningful(start_index: int):
        for idx in range(start_index + 1, len(lines)):
            stripped = lines[idx].strip()
            if not stripped or stripped.startswith("#"):
                continue
            indent = len(lines[idx]) - len(lines[idx].lstrip(" "))
            return indent, stripped
        return None, None
    for index, raw_line in enumerate(lines):
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        indent = len(raw_line) - len(raw_line.lstrip(" "))
        while len(stack) > 1 and indent <= stack[-1][0]:
            stack.pop()
        container = stack[-1][1]
        if stripped.startswith("- "):
            if isinstance(container, list):
                container.append(parse_scalar(stripped[2:]))
            continue
        key, _, value = stripped.partition(":")
        key = key.strip()
        value = value.strip()
        if not key:
            continue
        if value == "":
            next_indent, next_stripped = next_meaningful(index)
            nested = [] if next_indent is not None and next_indent > indent and next_stripped.startswith("- ") else {}
            if isinstance(container, dict):
                container[key] = nested
                stack.append((indent, nested))
            continue
        if isinstance(container, dict):
            container[key] = parse_scalar(value)
    return result
existing_workflow = {}
if analysis_path.exists():
    parsed = parse_simple_yaml(analysis_path.read_text(encoding="utf-8", errors="ignore"))
    if isinstance(parsed.get("workflowEvidence"), dict):
        existing_workflow = parsed["workflowEvidence"]
applied_skills = existing_workflow.get("appliedSkills") if isinstance(existing_workflow.get("appliedSkills"), list) else [
    "implementation-runner",
    "completion-verifier",
]
skipped_skills = existing_workflow.get("skippedSkills") if isinstance(existing_workflow.get("skippedSkills"), list) else [
    "codex-review-code (not evaluated yet)",
    "code-simplifier (not evaluated yet)",
    "doc-auto-sync (not evaluated yet)",
    "session-logger (clean completion path)",
]
if qa_report_path and qa_report_path.exists():
    section = extract_workflow_section(qa_report_path.read_text(encoding="utf-8", errors="ignore"))
    if section.get("selected"):
        selected_bundles = parse_list_string(section["selected"])
    if section.get("applied"):
        applied_skills = parse_list_string(section["applied"])
    if section.get("skipped"):
        skipped_skills = parse_list_string(section["skipped"])
workflow_block = [
    "workflowEvidence:",
    f"  mode: {yaml_scalar('bounded-direct')}",
    "  selectedBundles:",
]
workflow_block.extend(f"    - {yaml_scalar(item)}" for item in selected_bundles)
workflow_block.append("  requiredSkills:")
workflow_block.extend(f"    - {yaml_scalar(item)}" for item in required_skills)
workflow_block.append("  stageOrder:")
workflow_block.extend(f"    - {yaml_scalar(item)}" for item in stage_order)
workflow_block.append("  appliedSkills:")
workflow_block.extend(f"    - {yaml_scalar(item)}" for item in applied_skills)
workflow_block.append("  skippedSkills:")
workflow_block.extend(f"    - {yaml_scalar(item)}" for item in skipped_skills)
workflow_block.extend([
    "  evidenceFiles:",
    f"    analysisContext: {yaml_scalar(os.environ['ANALYSIS_PATH_VALUE'])}",
    f"    qaReport: {yaml_scalar(qa_report_value)}",
    f"    handoff: {yaml_scalar(handoff_value)}",
])
if analysis_path.exists():
    lines = analysis_path.read_text(encoding="utf-8").splitlines()
else:
    analysis_path.parent.mkdir(parents=True, exist_ok=True)
    lines = ['schemaVersion: "1.0"']
start = None
end = len(lines)
for idx, line in enumerate(lines):
    if line.startswith("workflowEvidence:"):
        start = idx
        end = len(lines)
        for next_idx in range(idx + 1, len(lines)):
            candidate = lines[next_idx]
            if candidate and not candidate.startswith(" ") and not candidate.startswith("\t"):
                end = next_idx
                break
        break
if start is None:
    if lines and lines[-1].strip():
        lines.append("")
    lines.extend(workflow_block)
else:
    lines = lines[:start] + workflow_block + lines[end:]
analysis_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
payload = {
    "evidenceVersion": "1.0",
    "recordedAt": os.environ["TIMESTAMP_VALUE"],
    "source": "moonshot-orchestrator",
    "mode": "bounded-direct",
    "analysisPath": os.environ["ANALYSIS_PATH_VALUE"],
    "qaReportPath": qa_report_value,
    "handoffPath": handoff_value,
    "selectedBundles": selected_bundles,
    "requiredSkills": required_skills,
    "stageOrder": stage_order,
    "appliedSkills": applied_skills,
    "skippedSkills": skipped_skills,
    "evidenceFiles": {
        "analysisContext": os.environ["ANALYSIS_PATH_VALUE"],
        "qaReport": qa_report_value or None,
        "handoff": handoff_value or None,
    },
}
target = Path(os.environ["LOG_FILE_VALUE"])
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
PY
  printf 'Workflow enforcement bounded evidence recorded: %s\n' "$log_file"
}
verify_enforcement() {
  local candidate_files
  candidate_files="$(collect_candidate_files "$@")"
  FILES_TEXT="$candidate_files" \
  LATEST_DISPATCH_FILE="${WORKFLOW_LOG_DIR}/latest-dispatch.json" \
  LATEST_BOUNDED_FILE="${WORKFLOW_LOG_DIR}/latest-bounded.json" \
  FORCE_TRACE="${WORKFLOW_ENFORCEMENT_REQUIRE_TRACE:-false}" \
  python3 - <<'PY'
import json
import os
from pathlib import Path
files = [line.strip() for line in os.environ.get("FILES_TEXT", "").splitlines() if line.strip()]
latest_dispatch = Path(os.environ["LATEST_DISPATCH_FILE"])
latest_bounded = Path(os.environ["LATEST_BOUNDED_FILE"])
force_trace = os.environ.get("FORCE_TRACE", "").lower() == "true"
def is_workflow_artifact(path: str) -> bool:
    normalized = path.replace("\\", "/")
    if normalized == ".claude/docs/phase-status.yaml":
        return True
    if normalized.startswith(".claude/logs/agent-loop/"):
        return True
    if normalized.startswith(".claude/logs/workflow-enforcement/"):
        return True
    return any(
        normalized.endswith(suffix)
        for suffix in (
            "/SPRINT_CONTRACT.md",
            "/QA_REPORT.md",
            "/HANDOFF.md",
        )
    ) and "/execution/" in normalized
code_suffixes = {
    ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".py", ".rb", ".go", ".rs",
    ".java", ".kt", ".kts", ".cs", ".php", ".swift", ".scala", ".sh", ".bash",
    ".zsh", ".ps1", ".psm1", ".c", ".cc", ".cpp", ".cxx", ".h", ".hh", ".hpp",
    ".hxx",
}
def normalize(path: str) -> str:
    return path.replace("\\", "/")
analysis_files = [
    Path(path) for path in files
    if normalize(path) == ".claude/docs/moonshot-analysis.yaml" or normalize(path).endswith("/moonshot-analysis.yaml")
]
requires_phase_trace = any(is_workflow_artifact(path) for path in files)
requires_bounded_trace = bool(analysis_files)
requires_trace = force_trace or requires_phase_trace or requires_bounded_trace
if not requires_trace:
    print("Workflow enforcement: not applicable")
    raise SystemExit(0)
violations = []
code_change_detected = any(Path(path).suffix.lower() in code_suffixes for path in files)
def path_matches(path: str, suffix: str) -> bool:
    return path.endswith(suffix) or path.endswith(suffix.replace("/", "\\"))
sprint_contracts = [Path(path) for path in files if path_matches(path, "/SPRINT_CONTRACT.md")]
qa_reports = [Path(path) for path in files if path.endswith("/QA_REPORT.md") or path.endswith("\\QA_REPORT.md")]
handoffs = [Path(path) for path in files if path.endswith("/HANDOFF.md") or path.endswith("\\HANDOFF.md")]
def section_exists(text: str, heading: str) -> bool:
    return any(line.strip() == heading for line in text.splitlines())
def extract_bullet_value(text: str, heading: str, label: str) -> str:
    lines = text.splitlines()
    start = None
    for idx, line in enumerate(lines):
        if line.strip() == heading:
            start = idx + 1
            break
    if start is None:
        return ""
    prefix = f"- {label}:"
    for line in lines[start:]:
        if line.startswith("## "):
            break
        stripped = line.strip()
        if stripped.startswith(prefix):
            return stripped.split(":", 1)[1].strip()
    return ""
def extract_workflow_section(text: str):
    lines = text.splitlines()
    start = None
    for idx, line in enumerate(lines):
        if line.strip() == "## Workflow Execution":
            start = idx + 1
            break
    if start is None:
        return {}
    section = {}
    for line in lines[start:]:
        if line.startswith("## "):
            break
        stripped = line.strip()
        if stripped.startswith("- Selected bundles:"):
            section["selected"] = stripped.split(":", 1)[1].strip()
        elif stripped.startswith("- Applied skills:"):
            section["applied"] = stripped.split(":", 1)[1].strip()
        elif stripped.startswith("- Skipped skills:"):
            section["skipped"] = stripped.split(":", 1)[1].strip()
    return section
def parse_simple_yaml(text: str):
    result = {}
    stack = [(-1, result)]
    lines = text.splitlines()
    def parse_scalar(value: str):
        raw = value.strip()
        if raw in {"true", "false"}:
            return raw == "true"
        if (raw.startswith('"') and raw.endswith('"')) or (raw.startswith("'") and raw.endswith("'")):
            return raw[1:-1]
        return raw
    def next_meaningful(start_index: int):
        for idx in range(start_index + 1, len(lines)):
            stripped = lines[idx].strip()
            if not stripped or stripped.startswith("#"):
                continue
            indent = len(lines[idx]) - len(lines[idx].lstrip(" "))
            return indent, stripped
        return None, None
    for index, raw_line in enumerate(lines):
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        indent = len(raw_line) - len(raw_line.lstrip(" "))
        while len(stack) > 1 and indent <= stack[-1][0]:
            stack.pop()
        container = stack[-1][1]
        if stripped.startswith("- "):
            if isinstance(container, list):
                container.append(parse_scalar(stripped[2:]))
            continue
        key, _, value = stripped.partition(":")
        key = key.strip()
        value = value.strip()
        if not key:
            continue
        if value == "":
            next_indent, next_stripped = next_meaningful(index)
            nested = [] if next_indent is not None and next_indent > indent and next_stripped.startswith("- ") else {}
            if isinstance(container, dict):
                container[key] = nested
                stack.append((indent, nested))
            continue
        if isinstance(container, dict):
            container[key] = parse_scalar(value)
    return result
if requires_phase_trace:
    if not latest_dispatch.exists():
        violations.append("missing latest dispatch evidence at .claude/logs/workflow-enforcement/latest-dispatch.json")
    else:
        payload = json.loads(latest_dispatch.read_text(encoding="utf-8"))
        for key in ("planDir", "executionMode", "executionRoot", "runtime"):
            if not payload.get(key):
                violations.append(f"dispatch evidence missing '{key}'")
        for key in ("selectedBundles", "requiredSkills", "stageOrder"):
            value = payload.get(key)
            if not isinstance(value, list) or not value:
                violations.append(f"dispatch evidence missing non-empty '{key}'")
        selected_bundles = payload.get("selectedBundles") if isinstance(payload.get("selectedBundles"), list) else []
        for bundle in ("review-bundle", "verification-bundle", "finish-bundle"):
            if bundle not in selected_bundles:
                violations.append(f"dispatch evidence must include '{bundle}' in selectedBundles")
    if not qa_reports:
        violations.append("workflow trace required but no QA_REPORT.md change detected")
    for sprint_contract in sprint_contracts:
        if not sprint_contract.exists():
            violations.append(f"missing sprint contract: {sprint_contract.as_posix()}")
            continue
        text = sprint_contract.read_text(encoding="utf-8", errors="ignore")
        for heading in ("## Stage Order", "## Review Cadence", "## Finish Rule"):
            if not section_exists(text, heading):
                violations.append(f"{sprint_contract.as_posix()}: missing '{heading}' section")
    for qa_report in qa_reports:
        if not qa_report.exists():
            violations.append(f"missing QA report: {qa_report.as_posix()}")
            continue
        text = qa_report.read_text(encoding="utf-8", errors="ignore")
        for heading in ("## Review Checkpoint", "## Finish Readiness"):
            if not section_exists(text, heading):
                violations.append(f"{qa_report.as_posix()}: missing '{heading}' section")
        section = extract_workflow_section(text)
        if not section:
            violations.append(f"{qa_report.as_posix()}: missing '## Workflow Execution' section")
            continue
        for key, label in (("selected", "Selected bundles"), ("applied", "Applied skills"), ("skipped", "Skipped skills")):
            value = section.get(key, "")
            if not value:
                violations.append(f"{qa_report.as_posix()}: '{label}' must be filled with evidence, not placeholder text")
        applied = section.get("applied", "")
        skipped = section.get("skipped", "")
        selected = section.get("selected", "")
        if "review-bundle" not in selected:
            violations.append(f"{qa_report.as_posix()}: workflow execution must mention review-bundle")
        if "finish-bundle" not in selected:
            violations.append(f"{qa_report.as_posix()}: workflow execution must mention finish-bundle")
        if code_change_detected and (
            "codex-review-code" not in applied
            and ("codex-review-code" not in skipped or "not evaluated yet" in skipped.lower())
        ):
            violations.append(f"{qa_report.as_posix()}: code changes require codex-review-code evidence in applied or skipped skills")
        if code_change_detected and (
            "code-simplifier" not in applied
            and ("code-simplifier" not in skipped or "not evaluated yet" in skipped.lower())
        ):
            violations.append(f"{qa_report.as_posix()}: code changes require code-simplifier evidence in applied or skipped skills")
        if code_change_detected and (
            "doc-auto-sync" not in applied
            and ("doc-auto-sync" not in skipped or "not evaluated yet" in skipped.lower())
        ):
            violations.append(f"{qa_report.as_posix()}: code changes require doc-auto-sync evidence in applied or skipped skills")
        scope_status = extract_bullet_value(text, "## Verdict", "Scope status")
        next_path = extract_bullet_value(text, "## Verdict", "Next path")
        closeout_reason = extract_bullet_value(text, "## Verdict", "Closeout reason")
        stop_why = extract_bullet_value(text, "## Finish Readiness", "Why this round may stop now")
        remaining_scope = extract_bullet_value(text, "## Finish Readiness", "Remaining in-scope work")
        closeout_fields_present = any((scope_status, closeout_reason, stop_why, remaining_scope))
        if closeout_fields_present:
            if scope_status not in {"complete", "partial"}:
                violations.append(f"{qa_report.as_posix()}: 'Scope status' must be complete or partial")
            if next_path not in {"clean_finish", "retry_loop", "resume_later_handoff"}:
                violations.append(f"{qa_report.as_posix()}: 'Next path' must be clean_finish, retry_loop, or resume_later_handoff")
            if closeout_reason not in {"scope_complete", "verification_failed", "blocked", "interrupted", "context_limit", "user_pause", "deferred_verification"}:
                violations.append(f"{qa_report.as_posix()}: 'Closeout reason' must use an allowed reason code")
            if not stop_why:
                violations.append(f"{qa_report.as_posix()}: 'Why this round may stop now' must be filled")
            if not remaining_scope:
                violations.append(f"{qa_report.as_posix()}: 'Remaining in-scope work' must be filled")
            lowered_stop_why = stop_why.lower()
            if "checkpoint" in lowered_stop_why or "milestone" in lowered_stop_why:
                violations.append(f"{qa_report.as_posix()}: milestone-only stop reasons are invalid")
            if next_path == "clean_finish":
                if scope_status != "complete":
                    violations.append(f"{qa_report.as_posix()}: clean_finish requires Scope status = complete")
                if closeout_reason != "scope_complete":
                    violations.append(f"{qa_report.as_posix()}: clean_finish requires Closeout reason = scope_complete")
            elif next_path == "retry_loop":
                if closeout_reason != "verification_failed":
                    violations.append(f"{qa_report.as_posix()}: retry_loop requires Closeout reason = verification_failed")
            elif next_path == "resume_later_handoff" and closeout_reason not in {"blocked", "interrupted", "context_limit", "user_pause", "deferred_verification"}:
                violations.append(f"{qa_report.as_posix()}: resume_later_handoff requires a real stop reason, not scope_complete or verification_failed")
    for handoff in handoffs:
        if not handoff.exists():
            violations.append(f"missing handoff: {handoff.as_posix()}")
            continue
        text = handoff.read_text(encoding="utf-8", errors="ignore")
        for heading in ("## Resume Trigger", "## Checks To Rerun"):
            if not section_exists(text, heading):
                violations.append(f"{handoff.as_posix()}: missing '{heading}' section")
        if "session-logger" not in text:
            violations.append(f"{handoff.as_posix()}: incomplete stop evidence must mention session-logger")
        stop_reason = extract_bullet_value(text, "## Resume Trigger", "Stop reason")
        stop_why = extract_bullet_value(text, "## Resume Trigger", "Why this cannot continue in the current round")
        remaining_scope = extract_bullet_value(text, "## Remaining Scope", "Remaining in-scope work")
        handoff_fields_present = any((stop_reason, stop_why, remaining_scope)) or section_exists(text, "## Remaining Scope")
        if handoff_fields_present:
            if not section_exists(text, "## Remaining Scope"):
                violations.append(f"{handoff.as_posix()}: missing '## Remaining Scope' section")
            if stop_reason not in {"blocked", "interrupted", "context_limit", "user_pause", "deferred_verification"}:
                violations.append(f"{handoff.as_posix()}: 'Stop reason' must use an allowed handoff reason code")
            if not stop_why:
                violations.append(f"{handoff.as_posix()}: 'Why this cannot continue in the current round' must be filled")
            if not remaining_scope:
                violations.append(f"{handoff.as_posix()}: 'Remaining in-scope work' must be filled")
            lowered_stop_why = stop_why.lower()
            if "checkpoint" in lowered_stop_why or "milestone" in lowered_stop_why:
                violations.append(f"{handoff.as_posix()}: milestone-only handoff reasons are invalid")
if requires_bounded_trace:
    if latest_bounded.exists():
        payload = json.loads(latest_bounded.read_text(encoding="utf-8"))
        if payload.get("mode") != "bounded-direct":
            violations.append("bounded evidence must declare mode=bounded-direct")
        for key in ("selectedBundles", "requiredSkills", "stageOrder"):
            value = payload.get(key)
            if not isinstance(value, list) or not value:
                violations.append(f"bounded evidence missing non-empty '{key}'")
    analysis_checked = 0
    for analysis_file in analysis_files:
        if not analysis_file.exists():
            violations.append(f"missing analysis file: {analysis_file.as_posix()}")
            continue
        analysis_checked += 1
        payload = parse_simple_yaml(analysis_file.read_text(encoding="utf-8", errors="ignore"))
        workflow = payload.get("workflowEvidence") if isinstance(payload.get("workflowEvidence"), dict) else {}
        if not workflow:
            violations.append(f"{analysis_file.as_posix()}: missing workflowEvidence block")
            continue
        if workflow.get("mode") != "bounded-direct":
            violations.append(f"{analysis_file.as_posix()}: workflowEvidence.mode must be bounded-direct")
        selected = workflow.get("selectedBundles") if isinstance(workflow.get("selectedBundles"), list) else []
        required = workflow.get("requiredSkills") if isinstance(workflow.get("requiredSkills"), list) else []
        stage_order = workflow.get("stageOrder") if isinstance(workflow.get("stageOrder"), list) else []
        applied = workflow.get("appliedSkills") if isinstance(workflow.get("appliedSkills"), list) else []
        skipped = workflow.get("skippedSkills") if isinstance(workflow.get("skippedSkills"), list) else []
        if not selected:
            violations.append(f"{analysis_file.as_posix()}: workflowEvidence.selectedBundles must be non-empty")
        if not required:
            violations.append(f"{analysis_file.as_posix()}: workflowEvidence.requiredSkills must be non-empty")
        if not stage_order:
            violations.append(f"{analysis_file.as_posix()}: workflowEvidence.stageOrder must be non-empty")
        if not applied:
            violations.append(f"{analysis_file.as_posix()}: workflowEvidence.appliedSkills must be non-empty")
        if not skipped:
            violations.append(f"{analysis_file.as_posix()}: workflowEvidence.skippedSkills must be non-empty")
        skipped_text = " | ".join(str(item) for item in skipped)
        applied_text = " | ".join(str(item) for item in applied)
        if code_change_detected and "review-bundle" not in selected:
            violations.append(f"{analysis_file.as_posix()}: bounded direct code changes must select review-bundle")
        if code_change_detected and "finish-bundle" not in selected:
            violations.append(f"{analysis_file.as_posix()}: bounded direct code changes must select finish-bundle")
        if code_change_detected and (
            "codex-review-code" not in applied_text
            and ("codex-review-code" not in skipped_text or "not evaluated yet" in skipped_text.lower())
        ):
            violations.append(f"{analysis_file.as_posix()}: bounded direct code changes require codex-review-code evidence")
        if code_change_detected and (
            "code-simplifier" not in applied_text
            and ("code-simplifier" not in skipped_text or "not evaluated yet" in skipped_text.lower())
        ):
            violations.append(f"{analysis_file.as_posix()}: bounded direct code changes require code-simplifier evidence")
        if code_change_detected and (
            "doc-auto-sync" not in applied_text
            and ("doc-auto-sync" not in skipped_text or "not evaluated yet" in skipped_text.lower())
        ):
            violations.append(f"{analysis_file.as_posix()}: bounded direct code changes require doc-auto-sync evidence")
        if payload.get("signals", {}).get("handoffRequired") is True and "session-logger" not in applied_text and "session-logger" not in skipped_text:
            violations.append(f"{analysis_file.as_posix()}: handoffRequired=true requires session-logger evidence")
print("Workflow Enforcement Check")
print(f"Applicable: {'yes' if requires_trace else 'no'}")
print(f"Phase dispatch evidence: {latest_dispatch.as_posix() if latest_dispatch.exists() else 'missing'}")
print(f"Bounded evidence: {latest_bounded.as_posix() if latest_bounded.exists() else 'missing'}")
print(f"Sprint contracts checked: {len(sprint_contracts)}")
print(f"QA reports checked: {len(qa_reports)}")
print(f"Handoffs checked: {len(handoffs)}")
print(f"Analysis files checked: {len(analysis_files)}")
if violations:
    print(f"Violations: {len(violations)}")
    for item in violations:
        print(f"- {item}")
    raise SystemExit(1)
print("Violations: 0")
PY
}
if [[ $# -eq 0 ]]; then
  usage
  exit 1
fi
command_name="$1"
shift
case "$command_name" in
  record-dispatch)
    record_dispatch "$@"
    ;;
  record-bounded)
    record_bounded "$@"
    ;;
  verify)
    verify_enforcement "$@"
    ;;
  --help|-h|help)
    usage
    ;;
  *)
    log_error "Unknown subcommand: $command_name"
    usage
    exit 1
    ;;
esac
