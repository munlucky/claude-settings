get_next_phase() {
    if [[ -f "$STATUS_FILE" ]]; then
        python3 - "$STATUS_FILE" <<'PY'
import re
import sys

status_file = sys.argv[1]
with open(status_file, "r", encoding="utf-8") as handle:
    lines = handle.readlines()

blocks = []
current = None
for raw_line in lines:
    if re.match(r"^\s*-\s+number:\s*", raw_line):
        if current is not None:
            blocks.append(current)
        current = {"number": None, "status": None, "planConfirmed": None}
        match = re.search(r"number:\s*([0-9]+)", raw_line)
        if match:
            current["number"] = match.group(1)
        continue
    if current is None:
        continue
    stripped = raw_line.strip()
    if stripped.startswith("status:"):
        current["status"] = stripped.split(":", 1)[1].strip()
    elif stripped.startswith("planConfirmed:"):
        current["planConfirmed"] = stripped.split(":", 1)[1].strip().lower()

if current is not None:
    blocks.append(current)

for block in blocks:
    status = block.get("status")
    plan_confirmed = block.get("planConfirmed")
    if status in {"pending", "in_progress"} and plan_confirmed != "false":
        if block.get("number") is not None:
            print(block["number"])
            break
PY
    else
        echo "1"
    fi
}

get_phase_title() {
    local phase_num=$1
    local phase_prefix
    printf -v phase_prefix '%02d' "$phase_num"
    local phase_doc
    phase_doc=$(get_phase_doc "$phase_num")
    if [[ -n "$phase_doc" ]]; then
        head -5 "$phase_doc" | grep -E "^#" | head -1 | sed 's/^#* //' | tr -d '\r'
    else
        echo "Phase $phase_num"
    fi
}

get_phase_doc() {
    local phase_num=$1
    local phase_prefix
    printf -v phase_prefix '%02d' "$phase_num"
    find "$PLAN_DIR" -maxdepth 1 \( -name "${phase_prefix}-*.md" -o -name "*phase*${phase_num}*" \) 2>/dev/null | head -1
}

sanitize_slug() {
    echo "$1" \
        | tr -d '\r' \
        | tr '[:upper:]' '[:lower:]' \
        | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//'
}

count_total_phases() {
    find "$PLAN_DIR" -maxdepth 1 -name "*.md" ! -name "*master*" ! -name "*00-*" 2>/dev/null | wc -l | tr -d ' '
}

render_required_verification_commands() {
    if [[ ! -f "$VERIFICATION_CONTRACT_FILE" ]] || ! command -v python3 >/dev/null 2>&1; then
        printf '%s\n' "- Populate from the active verification contract before claiming completion."
        return
    fi

    python3 - "$VERIFICATION_CONTRACT_FILE" <<'PY'
import sys


def parse_scalar(value):
    value = value.strip()
    if value in ("true", "false"):
        return value == "true"
    if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
        return value[1:-1]
    return value


def next_meaningful(lines, start_index):
    for idx in range(start_index + 1, len(lines)):
        stripped = lines[idx].strip()
        if not stripped or stripped.startswith("#"):
            continue
        indent = len(lines[idx]) - len(lines[idx].lstrip(" "))
        return indent, stripped
    return None, None


def parse_simple_yaml(path):
    with open(path, "r", encoding="utf-8") as handle:
        lines = handle.read().splitlines()

    root = {}
    stack = [(-1, root)]

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
            next_indent, next_stripped = next_meaningful(lines, index)
            nested = [] if next_indent is not None and next_indent > indent and next_stripped.startswith("- ") else {}
            if isinstance(container, dict):
                container[key] = nested
                stack.append((indent, nested))
            continue

        if isinstance(container, dict):
            container[key] = parse_scalar(value)

    return root


def as_list(value):
    if isinstance(value, list):
        return [item for item in value if isinstance(item, (str, int, float, bool))]
    if value in (None, ""):
        return []
    return [value]


contract = parse_simple_yaml(sys.argv[1])
commands = contract.get("commands", {}) if isinstance(contract.get("commands"), dict) else {}
policy = contract.get("policy", {}) if isinstance(contract.get("policy"), dict) else {}
required = [str(item) for item in as_list(policy.get("requiredChecks"))]

lines = []
for check_name in required:
    command = commands.get(check_name)
    if command:
        lines.append(f"- {check_name}: `{command}`")
    else:
        lines.append(f"- {check_name}: declare the command in {sys.argv[1]}")

if not lines:
    lines.append("- Populate from the active verification contract before claiming completion.")

print("\n".join(lines))
PY
}

ensure_execution_artifacts() {
    local phase_num="$1"
    local phase_title="$2"
    local phase_doc="$3"
    local phase_prefix
    local phase_slug
    local required_commands

    assign_execution_artifact_paths "$phase_num" "$phase_title"
    required_commands="$(render_required_verification_commands)"

    mkdir -p "$PHASE_EXECUTION_DIR"

    if [[ ! -f "$PHASE_SPRINT_CONTRACT" ]]; then
        cat > "$PHASE_SPRINT_CONTRACT" <<EOF
# Phase ${phase_prefix} Sprint Contract

> Seeded automatically by \`agent-loop.sh\`. Refresh before code changes.

## Slice
- Phase: ${phase_num}
- Title: ${phase_title}
- Source plan: ${MASTER_PLAN}
- Source phase doc: ${phase_doc}

## Round Goal
- Fill before code changes.

## Non-Goals
- Fill before code changes.

## Stage Order
- Ready / Isolate
- Execute
- Review
- Verify
- Finish / Handoff

## Planned Changes
- Files/modules:
- Interfaces/contracts:

## Policy Anchors
- Always-loaded rules: AGENTS.md, .claude/CLAUDE.md, .claude/rules/**
- Active workspace contract: .claude/PROJECT.md
- Verification contract: ${VERIFICATION_CONTRACT_FILE}
- Phase-specific guides: .claude/docs/guidelines/long-running-harness.md
- Round policy summary: Keep this run isolated to phase ${phase_prefix}, refresh QA/HANDOFF artifacts when state changes, and require fresh verification evidence before completion.

## Review Cadence
- First review checkpoint: After the first meaningful implementation batch for this phase.
- Re-review trigger: Any remediation round that changes behavior, contracts, or user-visible flows.
- Review owners: codex-review-code, plus targeted reviewers when needed.

## Done Checks
| Check | Type | Pass Condition |
|-------|------|----------------|
|  | UI/API/Test |  |

## Evaluator Focus
- Core flow:
- Edge cases:
- Stub-only behavior to reject:

## Evidence
### Required Verification Commands
${required_commands}

### Runtime Flow
- Fill before runtime verification.

### Artifacts
- QA report: ${PHASE_QA_REPORT}
- Handoff: ${PHASE_HANDOFF}
- Scorecard: ${PHASE_SCORECARD}

## Finish Rule
- Clean finish requires: fresh verification evidence, review complete, and finish-stage closeout recorded.
- Continue-now rule: if in-scope work remains and there is no blocker, interruption, user pause, or intentionally deferred verification, continue execution; checkpoint evidence alone is not a stop reason.
- Resume-later handoff trigger: blocked criteria, interruption, or intentionally deferred verification.
- Retry-loop trigger: verification or review returns actionable failures for this phase.
- Score target: ${TARGET_COMPLETION_SCORE}

## Risks
- Known uncertainty:
- Rollback or safe fallback:

## Notes
- Generated at: $(date '+%Y-%m-%d %H:%M:%S')
EOF
    fi

    if [[ ! -f "$PHASE_QA_REPORT" ]]; then
        cat > "$PHASE_QA_REPORT" <<EOF
# Phase ${phase_prefix} QA Report

> Updated by verifier/runtime steps. Seeded automatically by \`agent-loop.sh\`.

## Slice
- Phase: ${phase_num}
- Title: ${phase_title}
- Contract: ${PHASE_SPRINT_CONTRACT}

## Verdict
- Status: pending
- Summary: Awaiting implementation and verification.
- Scope status: partial
- Next path: retry_loop
- Closeout reason: verification_failed

## Review Checkpoint
- Review completed: no
- Review owners: codex-review-code
- Review-driven code changes:

## Criteria Review
| Criterion | Result | Notes |
|-----------|--------|-------|
|  | pending |  |

## Findings
| Severity | Area | Reproduction | Expected | Actual |
|----------|------|--------------|----------|--------|
|  |  |  |  |  |

## Runtime Updates
- Seeded at: $(date '+%Y-%m-%d %H:%M:%S')

## Workflow Execution
- Selected bundles: ready-isolate-bundle, implementation-bundle, review-bundle, verification-bundle, finish-bundle
- Applied skills: implementation-runner, completion-verifier
- Skipped skills: codex-review-code (review pending until the first meaningful implementation batch completes), code-simplifier (not evaluated yet), session-logger (clean completion path unless the phase stops without clean completion)
- Enforcement note: replace defaults when actual execution diverges

## Score Summary
- Current score: 0
- Target score: ${TARGET_COMPLETION_SCORE}
- Unmet checklist items: 1
- Blocking defects: 0
- Verdict: retry

## Finish Readiness
- Fresh evidence confirmed: no
- Why this round may stop now:
- Remaining in-scope work:
- Remaining blockers before closeout:
- Checks to rerun if code changes again:
EOF
    fi

    if [[ ! -f "$PHASE_SCORECARD" ]]; then
        if command -v python3 >/dev/null 2>&1 && [[ -f ".claude/scripts/render-scorecard.py" ]]; then
            python3 .claude/scripts/render-scorecard.py \
                --phase-prefix "$phase_prefix" \
                --phase-title "$phase_title" \
                --target-score "$TARGET_COMPLETION_SCORE" \
                --qa-report "$PHASE_QA_REPORT" \
                --profile "$SCORECARD_PROFILE" \
                --phase-doc "$phase_doc" \
                --requirements-file "${EXECUTION_ROOT}/REQUIREMENTS_TRACEABILITY.md" \
                --scenario-file "${EXECUTION_ROOT}/SCENARIO_MATRIX.md" \
                > "$PHASE_SCORECARD"
        else
            cat > "$PHASE_SCORECARD" <<EOF
# Phase ${phase_prefix} Scorecard

> Objective completion score for phase ${phase_prefix}. Update after every meaningful implementation or verification round.
> Preset profile: generic (fallback)
> Profile selection: fallback:no-renderer
> Coverage rebalance: counts:absent

## Objective Checklist
| ID | Category | Weight | Status | Evidence | Notes |
|----|----------|--------|--------|----------|-------|
| OBJ-REQ | In-scope requirements covered | 40 | pending | ${PHASE_QA_REPORT} | REQ-* coverage |
| OBJ-SCN | Critical scenarios evidenced | 30 | pending | ${PHASE_QA_REPORT} | SCN-* runtime or E2E evidence |
| OBJ-VER | Required verification commands passed | 20 | pending | ${PHASE_QA_REPORT} | Fresh contract-backed evidence |
| OBJ-CLOSE | Review and finish closeout recorded | 10 | pending | ${PHASE_QA_REPORT} | Review + finish evidence present |

## Score Summary
- Current score: 0
- Target score: ${TARGET_COMPLETION_SCORE}
- Unmet checklist items: 4
- Blocking defects: 0
- Verdict: retry

## Loop Policy
- \`done\` requires Current score >= Target score
- \`done\` requires Unmet checklist items = 0
- \`done\` requires Blocking defects = 0
- \`blocked\` means environment, contract, or dependency prevents progress
- \`retry\` means continue the active phase only
EOF
        fi
    fi
}

assign_execution_artifact_paths() {
    local phase_num="$1"
    local phase_title="$2"
    local phase_prefix
    local phase_slug

    printf -v phase_prefix '%02d' "$phase_num"
    phase_slug=$(sanitize_slug "$phase_title")
    if [[ -z "$phase_slug" ]]; then
        phase_slug="phase-${phase_prefix}"
    fi

    PHASE_EXECUTION_DIR="${EXECUTION_ROOT}/${phase_prefix}-${phase_slug}"
    PHASE_SPRINT_CONTRACT="${PHASE_EXECUTION_DIR}/SPRINT_CONTRACT.md"
    PHASE_QA_REPORT="${PHASE_EXECUTION_DIR}/QA_REPORT.md"
    PHASE_HANDOFF="${PHASE_EXECUTION_DIR}/HANDOFF.md"
    PHASE_SCORECARD="${PHASE_EXECUTION_DIR}/SCORECARD.md"
}

build_phase_prompt() {
    local extra_instructions="${1:-}"
    local prompt_header="/moonshot-orchestrator"
    local codex_direct_steps=""

    if [[ "$RUNNER_RUNTIME" == "codex" ]]; then
        prompt_header="Moonshot orchestrator phase-attempt fallback for Codex
Treat this prompt as the direct equivalent of a /moonshot-orchestrator phase attempt."
        codex_direct_steps="
Codex direct execution checklist:
1. Read only the active phase doc and SPRINT_CONTRACT.md first.
2. Refresh SPRINT_CONTRACT.md for this attempt without broad repo inspection.
3. Execute only the active phase work.
4. Run review and verification in the phase contract order.
5. Use \`.claude/scripts/write-verification-verdict.py\` for structured \`.claude/verification-verdict-*.json\` output in the repository root instead of hand-authoring verdict JSON.
6. Record the exact repository-root verdict path in QA_REPORT.md as \`- Verification verdict file: .claude/verification-verdict-...\`.
7. Update QA_REPORT.md with runtime/mode, review state, and verification evidence.
8. Update SCORECARD.md with objective checklist status, score, unmet items, and verdict.
9. If verification passed, SCORECARD.md says \`Verdict: done\`, and finish-stage conditions are satisfied, stop immediately. If not, update HANDOFF.md and stop.

Do not spend time on extra planning, repo discovery, or alternative verifier selection before step 4.
Edit the artifact files directly with the runtime's file-edit tool. Do not use shell heredocs or inline apply_patch commands for these artifact updates."
    fi

    cat <<EOF
$prompt_header
phaseAttemptMode: true
phaseNumber: "$NEXT_PHASE"
phaseTitle: "$PHASE_TITLE"
planDir: "$PLAN_DIR"
activePhaseDocPath: "$PHASE_DOC"
phaseStatusFile: "$STATUS_FILE"
executionRoot: "$EXECUTION_ROOT"
executionArtifacts:
  sprintContractPath: "$PHASE_SPRINT_CONTRACT"
  qaReportPath: "$PHASE_QA_REPORT"
  handoffPath: "$PHASE_HANDOFF"
  scorecardPath: "$PHASE_SCORECARD"
  verificationVerdictGlob: ".claude/verification-verdict-*.json"

Single isolated phase-attempt rules:
- Treat this run as one isolated phase attempt only.
- Set signals.phaseAttemptMode = true.
- Set artifacts.activePhaseDocPath = "$PHASE_DOC".
- Reuse the provided execution artifact paths.
- Do not invoke moonshot-phase-runner again.
- Do not expand to other phases.
- Read the Policy Anchors section in SPRINT_CONTRACT.md first.
- Preserve the stage order \`ready/isolate -> execute -> review -> verify -> finish/handoff\`.
- Before code edits, refresh SPRINT_CONTRACT.md for this phase.
- Record review completion before claiming the verifier state is final.
- Generate fresh structured verification verdicts with \`.claude/scripts/write-verification-verdict.py\` and write them under \`.claude/verification-verdict-*.json\`; do not hand-author verdict JSON.
- Record the exact repository-root verdict path in QA_REPORT.md so the completion gate can confirm the same file.
- When verification runs, update QA_REPORT.md.
- Update SCORECARD.md on every meaningful round using objective checklist status, current score, unmet items, and verdict.
- Refresh the default values in the "Workflow Execution" section of QA_REPORT.md when actual execution diverges.
- If meaningful code changed, record \`code-simplifier\` in Applied skills or Skipped skills with a reason.
- If the run stops without clean completion, update HANDOFF.md, include \`session-logger\` evidence, and list the checks to rerun.
- Do not mark the phase done while SCORECARD.md says \`Verdict: retry\` or \`blocked\`.
- Do not mark the phase done while Current score is below ${TARGET_COMPLETION_SCORE}, Unmet checklist items > 0, or Blocking defects > 0.

Runtime compatibility fallback:
- If /moonshot-orchestrator is unavailable in this runtime, execute the equivalent phase-attempt workflow directly instead of searching for missing slash skills.
- In fallback mode, use only the active phase doc, SPRINT_CONTRACT.md, QA_REPORT.md, HANDOFF.md, SCORECARD.md, .claude/PROJECT.md, .claude/verification.contract.yaml, and .claude/docs/guidelines/long-running-harness.md unless the phase doc explicitly requires more.
- Do not inspect unrelated repository files once the required verification command and artifact updates are clear.
- Once fresh verification evidence exists, the execution artifacts reflect the outcome, and SCORECARD.md says \`Verdict: done\`, stop immediately and return control to the caller.
$codex_direct_steps

Additional instructions:
${extra_instructions}

$AUTONOMOUS_INSTRUCTIONS
EOF
}
