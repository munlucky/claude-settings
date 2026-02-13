---
name: failure-analyzer
description: Analyzes agent failures and suggests system improvements (context/skills/agents/rules).
context: fork
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

## Failure Categories

| Category | Description | Target |
|----------|-------------|--------|
| **context_missing** | Agent lacks necessary info | `PROJECT.md`, `rules/*` |
| **tool_missing** | Required tool/script missing | New skill/script proposal |
| **skill_logic_error** | Skill logic fails in scenario | `SKILL.md` logic update |
| **guardrail_missing** | Repeated violation of patterns | `rules/quality.md`, boundaries |
| **prompt_gap** | System prompt misses scenario | `CLAUDE.md`, `AGENTS.md` |
| **retry_exhausted** | Self-healing loop maxed out | `build-error-resolver` DB |

## Analysis Workflow

1. **Scan Logs**: Read `notes` for error signals (`error`, `failed`, `violation`, `timeout`).
2. **Pattern Match**: Match against failure categories.
3. **Map to Target**: Identify which file/rule needs improvement.
4. **Formulate Suggestion**: Create concrete improvement proposal.

## Output (patch)

```yaml
failureReport:
  totalFailures: 3
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
      file: ".claude/skills/codex-review-code/SKILL.md"
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

### Skill Level (`.claude/skills/*.md`)
- **Logic**: Flow corrections, condition updates
- **Prompts**: Instruction clarifications

---
