---
name: failure-analyzer
description: Analyzes agent failures and suggests system improvements (context/skills/agents/rules).
context: fork
surfaceStatus: internal_stage_owner
---

# Failure Analyzer Skill

> **Purpose**: Convert failure into system feedback. Analyze `analysisContext.notes`, `session-logs`, and tool outputs to identify failure patterns and suggest improvements.
> **When**: Triggered by `moonshot-orchestrator` when multiple failures occur or explicitly requested.

---

## Inputs
- `analysisContext.notes` — Logs of errors and decisions
- `session-logs` — Recent activities
- `projectMemory` — Current project context
- `skillChain` — Executed skills
- AWTL `failed_turn_case` records when the failure originated from a captured phase attempt
- Replay scorecard summaries when a previous prevention hint may be stale, risky, or denied

## Failure Categories

| Category | Description | Target |
|----------|-------------|--------|
| **context_missing** | Agent lacks necessary info | `PROJECT.md`, `rules/*` |
| **tool_missing** | Required tool/script missing | New skill/script proposal |
| **skill_logic_error** | Skill logic fails in scenario | `SKILL.md` logic update |
| **guardrail_missing** | Repeated violation of patterns | `rules/quality.md`, boundaries |
| **prompt_gap** | System prompt misses scenario | `CLAUDE.md`, `AGENTS.md` |
| **retry_exhausted** | Self-healing loop maxed out | `build-error-resolver` DB |
| **execution_plane_mismatch** | Downstream flow treated as meta-harness or vice versa | `moonshot-orchestrator`, `workflow.md` |
| **readiness_gate_missing** | Implementation started without project/context readiness | gate skills, `pre-flight-check` |
| **verification_contract_missing** | Completion evidence unclear because contract was absent | verification contract docs, evidence gate |
| **correction_lesson** | User correction reveals a reusable workflow or quality mistake | `analysisContext.notes`, optional `session-logger`, `.moonshot-relay/docs/solutions/`, relevant skill/rule |
| **failed_turn_prevention_gap** | A repeated failure turn did not produce a usable failed turn case or prevention hint | AWTL analyzer, phase-runner brief, replay scorecard |

## Systematic Debugging Rules

- Do not propose a fix before recording root-cause evidence.
- Treat repeated symptoms as the same `failureClass` until evidence proves otherwise.
- If the same `failureClass` appears twice, change tactic before the next retry.
- If three attempts fail, escalate to design/contract review instead of continuing local fixes.
- For bug reports that leave the current run, draft the follow-up as behavior, reproduction steps, root cause, and RED-GREEN fix cycles.
- Keep external issue drafts durable: avoid file paths and line numbers unless the user requests tactical implementation notes.
- After a user correction, distinguish one-off preference from reusable workflow mistake before proposing durable rule or skill changes.
- Record reusable correction lessons compactly; avoid turning every correction into a new rule.
- When a captured failure has a turn id, keep `failure_turn_id` in the analysis output and cite redacted evidence refs instead of raw trace payloads.
- Do not reuse a prior prevention hint when the replay scorecard marks it stale, risky, denied, or unverified.

## Analysis Workflow

1. **Scan Logs**: Read `notes` for error signals (`error`, `failed`, `violation`, `timeout`).
2. **Pattern Match**: Match against failure categories and assign `failureClass`.
3. **Root Cause Evidence**: Identify the strongest concrete evidence, not just the visible symptom.
4. **Attempt History**: Count prior attempted fixes for the same `failureClass`.
5. **Map to Target**: Identify which file/rule/contract needs improvement.
6. **Next Tactic**: Propose a changed tactic when the same class repeats.
7. **Correction Lesson**: If the trigger was user correction, state whether it is reusable, where it should be logged, and whether a rule/skill change is justified.
8. **Turn Prevention Target**: For turn-scoped failures, state whether the right fix is capture, failed turn case creation, next-run brief matching, or MemoryGraph promotion policy.

## Output (patch)

```yaml
failureReport:
  totalFailures: 3
  failureClass: "verification_contract_missing"
  rootCauseEvidence:
    - "No verification command was recorded before completion claim"
  attemptedFixes:
    - "Re-ran implementation without changing verification contract"
  sameFailureClassCount: 2
  nextTactic: "Return to contract definition before retrying implementation"
  issueDraft:
    problem: ""
    expectedBehavior: ""
    reproductionSteps: []
    rootCauseSummary: ""
    tddFixPlan:
      - red: ""
        green: ""
  correctionLesson:
    reusable: true
    summary: "Completion was claimed before fresh verifier evidence existed."
    logTarget: "analysisContext.notes"
    durableTarget: ".moonshot-relay/docs/solutions/"
    ruleOrSkillChangeJustified: true
  turnFailure:
    failure_turn_id: "turn-phase05-attempt01"
    failedTurnCasePath: ".claude/cache/awtl/failed_turn_cases.jsonl"
    preventionHintTarget: "phase-runner failure prevention brief"
    replayScorecardStatus: "verified|denied|stale|risky|not_checked"
  categorized:
    - type: "context_missing"
      description: "Agent consistently formatted API response wrong"
      evidence: "Validation failed 3 times on response format"

systemImprovements:
  # Project-specific improvements (PROJECT.md)
  projectSpecific:
    - type: "project_rule"
      file: ".claude/PROJECT.md"
      section: "Core Rules"
      change: "Explicitly define API response format: { success, data, error }"
      priority: HIGH
      autoApplicable: true

  # Universal improvements (CLAUDE.md / rules / skills)
  universal:
    - type: "rule_update"
      file: ".claude/rules/coding-style.md"
      change: "Add rule: no console.log in production code"
      priority: HIGH
      autoApplicable: true
    - type: "skill_fix"
      file: "skills/codex-review-code/SKILL.md"
      change: "Add check for new security pattern X"
      priority: MEDIUM
      autoApplicable: false # logic change requires review
```

---

## Improvement Targets

### Project Level (`.claude/PROJECT.md`)
- **Core Rules**: Project-wide invariants
- **API Patterns**: Data shapes and protocols
- **Verification Commands**: Test/lint commands
- **Directory Structure**: File organization expectations

### Universal Level (`.claude/CLAUDE.md`, `.claude/rules/*.md`)
- **Coding Style**: Universal style guides
- **Quality/Verification**: Testing standards
- **Security**: Universal security rules

### Skill Level (`skills/*.md`)
- **Logic**: Flow corrections, condition updates
- **Prompts**: Instruction clarifications

### Workflow Architecture Level
- **Routing**: execution plane detection and bypass policy
- **Readiness**: project/context/verification gate coverage
- **Contracts**: explicit verification and context schemas

---
