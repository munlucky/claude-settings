---
name: workflow-self-improver
description: Applies improvements suggested by failure-analyzer to system prompts (CLAUDE.md/rules), project settings (PROJECT.md), or skill definitions.
context: fork
---

# Workflow Self-Improver Skill

> **Purpose**: Automatically apply improvements to the "Meta-System" (prompts, rules, skills).
> **When**: After `failure-analyzer` produces `systemImprovements`.

---

## Inputs
- `systemImprovements.projectSpecific` — Improvements for PROJECT.md
- `systemImprovements.universal` — Improvements for CLAUDE.md rules / skills

## Execution Model

### 1. Observe (Filter)
Review improvements and check applicability:
- `autoApplicable: true` → Prepare for immediate application.
- `autoApplicable: false` → Add to `requireApproval` list.

### 2. Apply (Auto)
Apply approved changes directly:

| Target File | Action | Description |
|-------------|--------|-------------|
| `.claude/PROJECT.md` | Update Section | Append new content to section (DO NOT OVERWRITE existing) |
| `.claude/rules/*.md` | Append Rule | Add new rule to existing file |
| `.claude/CLAUDE.md` | Update Guideline | Modify global guideline |

### 3. Request (Manual)
For complex changes (skill logic, new files), create a task/request:
- Create `proposal/improvement-{id}.md`
- Request user review via output

## Safety Guards

1. **No Code Changes**: This skill ONLY modifies `.claude/` configuration/rules, NEVER source code.
2. **Backup**: Backup target file before modification (in memory or temp file).
3. **Validation**: Check YAML validity after modification if applicable.
4. **Skill Logic Lock**: Changes to `SKILL.md` files **ALWAYS** require `autoApplicable: false` (manual review).

## Output (patch)

```yaml
selfImprovementResult:
  applied:
    - file: ".claude/PROJECT.md"
      change: "Added API response format rule"
    - file: ".claude/rules/coding-style.md"
      change: "Added console.log prohibition"
  pendingApproval:
    - file: ".claude/skills/codex-review-code/SKILL.md"
      change: "Logic update for security check"
      reason: "Skill logic change requires review"
```

---

## Rollback Strategy

If application fails:
1. Restore from backup
2. Log error in `notes`
3. Move item to `pendingApproval` list

---
