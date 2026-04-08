evaluate_phase_completion_gate() {
    local phase_start_epoch="$1"
    local eval_output

    eval_output="$(PHASE_START_EPOCH="$phase_start_epoch" PHASE_QA_REPORT_PATH="$PHASE_QA_REPORT" PHASE_SCORECARD_PATH="$PHASE_SCORECARD" PHASE_EXECUTION_DIR="$PHASE_EXECUTION_DIR" PHASE_SCORECARD_REQUIRED="$SCORECARD_REQUIRED" PHASE_TARGET_COMPLETION_SCORE="$TARGET_COMPLETION_SCORE" python3 - <<'PY'
import glob
import json
import os
import shlex
import re

start_epoch = float(os.environ["PHASE_START_EPOCH"])
patterns = [
    ".claude/verification-verdict-*.json",
    ".claude/runtime-verdict-*.json",
]
qa_report_path = os.environ.get("PHASE_QA_REPORT_PATH", "")
scorecard_path = os.environ.get("PHASE_SCORECARD_PATH", "")
phase_execution_dir = os.environ.get("PHASE_EXECUTION_DIR", "")
scorecard_required = os.environ.get("PHASE_SCORECARD_REQUIRED", "true").lower() == "true"
target_score_default = int(os.environ.get("PHASE_TARGET_COMPLETION_SCORE", "100"))
qa_report_dir = os.path.dirname(qa_report_path) if qa_report_path else ""

if phase_execution_dir:
    patterns.extend([
        os.path.join(phase_execution_dir, "verification-verdict-*.json"),
        os.path.join(phase_execution_dir, "runtime-verdict-*.json"),
    ])


def resolve_candidate_path(raw_path):
    raw_path = (raw_path or "").strip()
    if not raw_path:
        return ""
    normalized = raw_path.strip().strip('"').strip("'")
    if not normalized:
        return ""
    if os.path.isabs(normalized):
        return normalized
    qa_relative = os.path.normpath(os.path.join(qa_report_dir or ".", normalized))
    if os.path.exists(qa_relative):
        return qa_relative
    root_relative = os.path.normpath(normalized)
    if os.path.exists(root_relative):
        return root_relative
    return qa_relative if qa_report_dir else root_relative


latest_by_script = {}
candidate_paths = set()
for pattern in patterns:
    for path in glob.glob(pattern):
        candidate_paths.add(path)

failures = []
passed_paths = []
code_change_detected = False

workflow_reason = "ok"
qa_fresh_evidence = False
qa_verdict_passed = False
qa_verification_lines = []
qa_verdict_paths = []
if qa_report_path:
    try:
        qa_lines = open(qa_report_path, "r", encoding="utf-8").read().splitlines()
    except OSError:
        qa_lines = []

    section = {}
    in_workflow = False
    current_heading = ""
    for line in qa_lines:
        stripped = line.strip()
        if stripped.startswith("## "):
            current_heading = stripped
        if line.strip() == "## Workflow Execution":
            in_workflow = True
            continue
        if in_workflow and line.startswith("## "):
            break
        if not in_workflow:
            continue
        stripped = line.strip()
        if stripped.startswith("- Selected bundles:"):
            section["selected"] = stripped.split(":", 1)[1].strip()
        elif stripped.startswith("- Applied skills:"):
            section["applied"] = stripped.split(":", 1)[1].strip()
        elif stripped.startswith("- Skipped skills:"):
            section["skipped"] = stripped.split(":", 1)[1].strip()

    current_heading = ""
    for line in qa_lines:
        stripped = line.strip()
        if stripped.startswith("## "):
            current_heading = stripped
            continue
        if current_heading == "## Verdict" and stripped.startswith("- Status:"):
            qa_verdict_passed = stripped.split(":", 1)[1].strip().lower() == "passed"
        elif current_heading == "## Finish Readiness" and stripped.startswith("- Fresh evidence confirmed:"):
            qa_fresh_evidence = stripped.split(":", 1)[1].strip().lower().startswith("yes")
        elif current_heading == "## Runtime Updates" and stripped.startswith("- Verification verdict file:"):
            verdict_path = stripped.split(":", 1)[1].strip()
            if verdict_path:
                qa_verdict_paths.append(verdict_path)
        elif current_heading == "## Runtime Updates" and stripped.startswith("- Verification verdict:"):
            if stripped.split(":", 1)[1].strip().lower() == "passed":
                qa_verification_lines.append(stripped)

    in_verification_evidence = False
    for line in qa_lines:
        stripped = line.strip()
        if stripped == "## Verification Evidence":
            in_verification_evidence = True
            continue
        if in_verification_evidence and line.startswith("## "):
            break
        if in_verification_evidence and stripped.startswith("- ") and "passed" in stripped.lower():
            qa_verification_lines.append(stripped)

    for verdict_path in qa_verdict_paths:
        resolved_path = resolve_candidate_path(verdict_path)
        if resolved_path:
            candidate_paths.add(resolved_path)

for path in sorted(candidate_paths):
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        continue
    if mtime + 1 < start_epoch:
        continue
    try:
        with open(path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except Exception:
        continue
    script = payload.get("script") or os.path.basename(path)
    previous = latest_by_script.get(script)
    if previous is None or mtime > previous[0]:
        latest_by_script[script] = (mtime, path, payload)

for script in sorted(latest_by_script):
    _mtime, path, payload = latest_by_script[script]
    verdict = payload.get("verdict")
    evidence_fresh = payload.get("evidenceFresh") is True
    contract = payload.get("contract") or {}
    verification_mode = payload.get("verificationMode") or contract.get("verificationMode") or ""
    contract_applicable = bool(contract.get("applicable"))
    missing_required = ((payload.get("requiredChecks") or {}).get("missing") or [])

    if verdict != "passed":
        failures.append(f"{script}:verdict={verdict}")
        continue
    if not evidence_fresh:
        failures.append(f"{script}:evidenceFresh=false")
        continue
    if (contract_applicable or verification_mode == "contract") and missing_required:
        failures.append(f"{script}:missingRequiredChecks")
        continue
    for changed_path in payload.get("changedFiles") or []:
        suffix = os.path.splitext(changed_path)[1].lower()
        if suffix in {
            ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".py", ".rb", ".go", ".rs",
            ".java", ".kt", ".kts", ".cs", ".php", ".swift", ".scala", ".sh", ".bash",
            ".zsh", ".ps1", ".psm1", ".c", ".cc", ".cpp", ".cxx", ".h", ".hh", ".hpp",
            ".hxx",
        }:
            code_change_detected = True
    passed_paths.append(path)

    if not section:
        workflow_reason = "workflow-section-missing"
    elif not section.get("selected"):
        workflow_reason = "workflow-selected-bundles-missing"
    elif not section.get("applied"):
        workflow_reason = "workflow-applied-skills-missing"
    elif not section.get("skipped"):
        workflow_reason = "workflow-skipped-skills-missing"
    elif code_change_detected and (
        "code-simplifier" not in section.get("applied", "")
        and (
            "code-simplifier" not in section.get("skipped", "")
            or "not evaluated yet" in section.get("skipped", "").lower()
        )
    ):
        workflow_reason = "workflow-code-simplifier-missing"

score_reason = "ok"
current_score = 0
target_score = target_score_default
unmet_items = 0
blocking_defects = 0
score_verdict = "missing"
score_source = "none"

latest_score_payload = None
for script in sorted(latest_by_script):
    _mtime, _path, payload = latest_by_script[script]
    score = payload.get("score")
    if isinstance(score, dict) and score.get("detected") is True:
        latest_score_payload = score

if latest_score_payload is not None:
    current_score = int(latest_score_payload.get("current", 0))
    target_score = int(latest_score_payload.get("target", target_score_default))
    unmet_items = int(latest_score_payload.get("unmetChecklistItems", 0))
    blocking_defects = int(latest_score_payload.get("blockingDefects", 0))
    score_verdict = str(latest_score_payload.get("verdict", "missing")).strip().lower().replace(" ", "_")
    score_source = "verifier-artifact"
elif scorecard_required:
    if not scorecard_path or not os.path.exists(scorecard_path):
        score_reason = "scorecard-missing"
    else:
        try:
            score_lines = open(scorecard_path, "r", encoding="utf-8").read().splitlines()
        except OSError:
            score_lines = []

        for line in score_lines:
            stripped = line.strip()
            match = re.match(r"^- Current score:\s*([0-9]+)\s*$", stripped)
            if match:
                current_score = int(match.group(1))
                continue
            match = re.match(r"^- Target score:\s*([0-9]+)\s*$", stripped)
            if match:
                target_score = int(match.group(1))
                continue
            match = re.match(r"^- Unmet checklist items:\s*([0-9]+)\s*$", stripped)
            if match:
                unmet_items = int(match.group(1))
                continue
            match = re.match(r"^- Blocking defects:\s*([0-9]+)\s*$", stripped)
            if match:
                blocking_defects = int(match.group(1))
                continue
            match = re.match(r"^- Verdict:\s*([A-Za-z_ -]+)\s*$", stripped)
            if match:
                score_verdict = match.group(1).strip().lower().replace(" ", "_")
        score_source = "scorecard-markdown"

if scorecard_required:
    if score_verdict != "done":
        score_reason = f"scorecard-verdict={score_verdict}"
    elif current_score < target_score:
        score_reason = "scorecard-score-below-target"
    elif unmet_items > 0:
        score_reason = "scorecard-unmet-items"
    elif blocking_defects > 0:
        score_reason = "scorecard-blocking-defects"

if not passed_paths and not failures and qa_fresh_evidence and (qa_verification_lines or qa_verdict_passed):
    passed_paths.append(qa_report_path or "qa-report-fallback")

allowed = bool(passed_paths) and not failures and workflow_reason == "ok" and score_reason == "ok"
reason = "ok" if allowed else (
    failures[0]
    if failures
    else workflow_reason
    if workflow_reason != "ok"
    else score_reason
    if score_reason != "ok"
    else "no-fresh-verification-artifact"
)

print(f"PHASE_COMPLETION_ALLOWED={'true' if allowed else 'false'}")
print(f"PHASE_COMPLETION_REASON={shlex.quote(reason)}")
print(f"PHASE_COMPLETION_ARTIFACTS={shlex.quote(chr(10).join(passed_paths))}")
print(f"PHASE_COMPLETION_SCORE={current_score}")
print(f"PHASE_COMPLETION_TARGET={target_score}")
print(f"PHASE_COMPLETION_UNMET={unmet_items}")
print(f"PHASE_COMPLETION_BLOCKERS={blocking_defects}")
print(f"PHASE_COMPLETION_SCORE_VERDICT={shlex.quote(score_verdict)}")
print(f"PHASE_COMPLETION_SCORE_SOURCE={shlex.quote(score_source)}")
PY
)"

    if [[ -n "$eval_output" ]]; then
        eval "$eval_output"
    else
        PHASE_COMPLETION_ALLOWED=false
        PHASE_COMPLETION_REASON="no-verification-evaluation"
        PHASE_COMPLETION_ARTIFACTS=""
    fi
}

evaluate_phase_completion_gate_with_retry() {
    local phase_start_epoch="$1"
    local retries="${2:-2}"
    local delay_seconds="${3:-2}"
    local attempt=0

    while true; do
        evaluate_phase_completion_gate "$phase_start_epoch"
        if [[ "$PHASE_COMPLETION_ALLOWED" == "true" ]]; then
            return 0
        fi
        if [[ "$PHASE_COMPLETION_REASON" != "no-fresh-verification-artifact" ]]; then
            return 0
        fi
        if [[ $attempt -ge $retries ]]; then
            return 0
        fi
        attempt=$((attempt + 1))
        sleep "$delay_seconds"
    done
}

update_phase_state() {
    local phase_num="$1"
    local new_status="$2"
    local timestamp="$3"
    local last_outcome="${4:-}"
    local increment_attempt="${5:-false}"
    local active_phase_doc="${6:-}"
    local sprint_contract_path="${7:-}"
    local qa_report_path="${8:-}"
    local handoff_path="${9:-}"
    local scorecard_path="${10:-}"

    if [[ ! -f "$STATUS_FILE" ]] || ! command -v python3 >/dev/null 2>&1; then
        return
    fi

    python3 - "$STATUS_FILE" "$phase_num" "$new_status" "$timestamp" "$last_outcome" "$increment_attempt" "$active_phase_doc" "$sprint_contract_path" "$qa_report_path" "$handoff_path" "$scorecard_path" <<'PY'
import re
import sys

(
    status_file,
    target_num,
    new_status,
    timestamp,
    last_outcome,
    increment_attempt,
    active_phase_doc,
    sprint_contract_path,
    qa_report_path,
    handoff_path,
    scorecard_path,
) = sys.argv[1:]

    with open(status_file, "r", encoding="utf-8") as handle:
        lines = handle.read().splitlines()

block_ranges = []
current_start = None
for idx, line in enumerate(lines):
    if re.match(r"^\s*-\s+number:\s*", line):
        if current_start is not None:
            block_ranges.append((current_start, idx))
        current_start = idx
if current_start is not None:
    block_ranges.append((current_start, len(lines)))

target_range = None
for start, end in block_ranges:
    match = re.search(r"number:\s*([0-9]+)", lines[start])
    if match and match.group(1) == target_num:
        target_range = (start, end)
        break

if target_range is None:
    raise SystemExit(0)

start, end = target_range
block = lines[start:end]
item_indent = len(block[0]) - len(block[0].lstrip(" "))
top_indent = " " * (item_indent + 2)
attempt_value_indent = " " * (item_indent + 4)


def set_top_level(key, value):
    prefix = f"{top_indent}{key}:"
    for idx, line in enumerate(block):
        if line.startswith(prefix):
            block[idx] = f"{prefix} {value}"
            return
    insert_at = len(block)
    for idx in range(1, len(block)):
        stripped = block[idx].lstrip(" ")
        indent = len(block[idx]) - len(stripped)
        if indent <= item_indent:
            insert_at = idx
            break
    block.insert(insert_at, f"{prefix} {value}")


def set_root_mapping_value(parent, child, value):
    parent_prefix = f"{parent}:"
    child_prefix = f"  {child}:"
    parent_idx = None
    parent_end = len(lines)
    for idx, line in enumerate(lines):
        if line.startswith(parent_prefix):
            parent_idx = idx
            for probe in range(idx + 1, len(lines)):
                stripped = lines[probe].lstrip(" ")
                indent = len(lines[probe]) - len(stripped)
                if indent == 0 and stripped:
                    parent_end = probe
                    break
            break
    if parent_idx is None:
        lines.extend([parent_prefix, f'{child_prefix} {value}'])
        return

    for idx in range(parent_idx + 1, parent_end):
        if lines[idx].startswith(child_prefix):
            lines[idx] = f'{child_prefix} {value}'
            return

    lines.insert(parent_end, f'{child_prefix} {value}')


def remove_root_key(parent):
    parent_prefix = f"{parent}:"
    for idx, line in enumerate(lines):
        if line.startswith(parent_prefix):
            end_idx = len(lines)
            for probe in range(idx + 1, len(lines)):
                stripped = lines[probe].lstrip(" ")
                indent = len(lines[probe]) - len(stripped)
                if indent == 0 and stripped:
                    end_idx = probe
                    break
            del lines[idx:end_idx]
            return


def ensure_attempts_block():
    prefix = f"{top_indent}attempts:"
    for idx, line in enumerate(block):
        if line.startswith(prefix):
            end_idx = len(block)
            for probe in range(idx + 1, len(block)):
                stripped = block[probe].lstrip(" ")
                indent = len(block[probe]) - len(stripped)
                if indent <= len(top_indent):
                    end_idx = probe
                    break
            return idx, end_idx

    insert_at = len(block)
    for idx in range(1, len(block)):
        stripped = block[idx].lstrip(" ")
        indent = len(block[idx]) - len(stripped)
        if indent <= item_indent:
            insert_at = idx
            break
    block[insert_at:insert_at] = [
        f"{top_indent}attempts:",
        f"{attempt_value_indent}total: 0",
        f"{attempt_value_indent}lastOutcome: pending",
        f'{attempt_value_indent}lastUpdatedAt: "{timestamp}"',
    ]
    return insert_at, insert_at + 4


def get_attempt_value(name, default="0"):
    start_idx, end_idx = ensure_attempts_block()
    prefix = f"{attempt_value_indent}{name}:"
    for idx in range(start_idx + 1, end_idx):
        if block[idx].startswith(prefix):
            return idx, block[idx].split(":", 1)[1].strip().strip('"')
    block.insert(end_idx, f"{prefix} {default}")
    return end_idx, default


set_top_level("status", new_status)
set_top_level("planConfirmed", "true")
if sprint_contract_path:
    set_top_level("sprintContract", f'"{sprint_contract_path}"')
if qa_report_path:
    set_top_level("qaReport", f'"{qa_report_path}"')
if handoff_path:
    set_top_level("handoff", f'"{handoff_path}"')
if scorecard_path:
    set_top_level("scorecard", f'"{scorecard_path}"')

if new_status == "completed":
    set_top_level("completedAt", f'"{timestamp}"')
else:
    completed_prefix = f"{top_indent}completedAt:"
    block[:] = [line for line in block if not line.startswith(completed_prefix)]

if increment_attempt.lower() == "true" or last_outcome:
    total_idx, total_value = get_attempt_value("total", "0")
    if increment_attempt.lower() == "true":
        try:
            total_number = int(total_value)
        except ValueError:
            total_number = 0
        block[total_idx] = f"{attempt_value_indent}total: {total_number + 1}"

    if last_outcome:
        outcome_idx, _ = get_attempt_value("lastOutcome", "pending")
        block[outcome_idx] = f"{attempt_value_indent}lastOutcome: {last_outcome}"

    updated_idx, _ = get_attempt_value("lastUpdatedAt", f'"{timestamp}"')
    block[updated_idx] = f'{attempt_value_indent}lastUpdatedAt: "{timestamp}"'

lines[start:end] = block

if new_status == "in_progress" and active_phase_doc:
    set_root_mapping_value("signals", "phaseAttemptMode", "true")
    set_root_mapping_value("artifacts", "activePhaseDocPath", f'"{active_phase_doc}"')
else:
    remove_root_key("signals")
    remove_root_key("artifacts")

    with open(status_file, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")
PY
}

list_stale_in_progress_phases() {
    local stale_seconds="${1:-1800}"

    if [[ ! -f "$STATUS_FILE" ]] || ! command -v python3 >/dev/null 2>&1; then
        return
    fi

    if ! python3 - "$STATUS_FILE" "$stale_seconds" <<'PY'
import sys
import datetime
import time
import re

status_file = sys.argv[1]
stale_seconds = float(sys.argv[2])
now = time.time()

def parse_timestamp(value):
    if not value:
        return None
    value = value.strip().strip('"')
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    try:
        parsed = datetime.datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=datetime.timezone.utc)
    return parsed.timestamp()

with open(status_file, "r", encoding="utf-8") as handle:
    lines = handle.read().splitlines()

blocks = []
current = None
current_indent = None
for raw_line in lines:
    if re.match(r"^\s*-\s+number:\s*", raw_line):
        if current is not None:
            blocks.append(current)
        match = re.search(r"number:\s*([0-9]+)", raw_line)
        current = {"number": match.group(1) if match else None, "status": None, "planConfirmed": None, "lastOutcome": None, "lastUpdatedAt": None}
        current_indent = len(raw_line) - len(raw_line.lstrip())
        continue
    if current is None:
        continue
    stripped = raw_line.strip()
    if stripped.startswith("status:"):
        current["status"] = stripped.split(":", 1)[1].strip()
    elif stripped.startswith("planConfirmed:"):
        current["planConfirmed"] = stripped.split(":", 1)[1].strip().lower()
    elif stripped.startswith("lastOutcome:"):
        current["lastOutcome"] = stripped.split(":", 1)[1].strip()
    elif stripped.startswith("lastUpdatedAt:"):
        current["lastUpdatedAt"] = stripped.split(":", 1)[1].strip()

if current is not None:
    blocks.append(current)

for block in blocks:
    status = block.get("status", "")
    plan_confirmed = block.get("planConfirmed")
    if status != "in_progress" or plan_confirmed == "false":
        continue
    if block.get("lastOutcome") != "running":
        continue
    updated_at = parse_timestamp(block.get("lastUpdatedAt", ""))
    if updated_at is None:
        continue
    if (now - updated_at) >= stale_seconds:
        number = block.get("number")
        if number is not None:
            print(number)
PY
    then
    :
fi
}
