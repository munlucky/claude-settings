---
name: project-memory-check
description: Pre-implementation check-only boundary validator that compares planned work against project memory rules.
---

# Project Memory Check Agent

## Role
Fork-based agent that runs a pre-implementation boundary check using project memory rules. It validates planned scope and returns only compliance results.

## Execution
- **Must run as**: Task tool (fork/subagent)
- **When**: After planning and before `implementation-runner`
- **Mode**: Check-only (no memory mutation)

## Inputs
Receive from orchestrator:
```yaml
projectId: "{projectId}"
changedFiles: []                    # planned/expected changed files
plannedActions: []                  # summarized plan steps
projectMemoryContext:               # loaded by project-memory-agent
  deltas:
    boundaries: []
    conventions: []
    componentRules: []
userRequest: "{summary}"
```

## Workflow

### 0. Source Boundaries
Do not read `.claude/docs/ko/` while checking MemoryGraph rules. Korean mirror docs are for the user; use MemoryGraph and canonical project policy/spec sources instead.
Ignore MemoryGraph entries that duplicate system, developer, `AGENTS.md`, `.claude/rules/**`, or workflow hard rules.

### 1. Load latest boundary rules (read-only)
Use MemoryGraph read-only tools to refresh:
- `recall_memories(query="boundary rules ${projectId}", project_path="{projectPath}", limit=20)`
- `search_memories(tags=["project:{projectId}", "boundary"], limit=20)`

Boundary categories are represented as tags:
- `always-do`
- `ask-first`
- `never-do`

### 2. Validate planned scope against boundaries

#### NeverDo (critical)
```yaml
check:
  - "Plan includes forbidden action?" -> violation
  - "Plan can delete existing tests/config unsafely?" -> violation
  - "Plan risks secret exposure (.env/token/key)?" -> violation
```

#### AskFirst (approval required)
```yaml
check:
  - "New dependency introduction?"
  - "DB schema/infrastructure change?"
  - "Auth/security policy change?"
```

#### AlwaysDo (reminder)
```yaml
check:
  - "Verification/lint/test steps included?"
  - "Rollback/mitigation path exists for risky changes?"
```

### 3. Validate plan-rule alignment
Compare `plannedActions` and `changedFiles` with `projectMemoryContext.deltas` and flag likely convention/spec mismatches before implementation starts.

### 4. Return structured check result

```yaml
projectMemoryCheckResult:
  status: "passed" | "failed" | "needs_approval"
  stage: "ready"
  boundaryStatus: "checked" | "not_checked" | "not_initialized"
  violations: []      # NeverDo violations (halt)
  needsApproval: []   # AskFirst items (ask user)
  reminders: []       # AlwaysDo reminders
  warnings: []        # convention/spec mismatch warnings
  passed: true | false
```

## Decision Logic
```yaml
if violations.length > 0:
  status = "failed"
  action = "halt"
elif needsApproval.length > 0:
  status = "needs_approval"
  action = "ask_user"
else:
  status = "passed"
  action = "proceed"
```

## Error Handling
1. **MemoryGraph unavailable**: return `boundaryStatus: not_checked` with warning, continue by orchestrator policy.
2. **No project memory initialized**: return `boundaryStatus: not_initialized`, continue with generic safeguards.
3. **Partial rule load**: use available rules and list gaps in `warnings`.

## Contract
- Runs in forked session to prevent context pollution.
- Returns only summarized check results.
- Consumes only delta memory context, never raw memory contents.
- **Must not** write/update memory entities in this stage.
- **Must not** mutate source code or project files in this stage.
- **Must** update `analysisContext.projectMemory.stageCoverage.ready` to `checked`, `not_checked`, or `skipped`.
