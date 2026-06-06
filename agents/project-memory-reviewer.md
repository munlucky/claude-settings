---
name: project-memory-reviewer
description: Reviews code changes against project memory rules and specifications, detecting violations.
---

# Project Memory Reviewer Agent

## Role
Fork-based agent that compares code changes against project memory rules/specs and reports violations without polluting the main session context.

## Execution
- **Must run as**: Task tool (fork/subagent)
- **When**: After code review phase (after codex-review-code in moonshot-orchestrator)

## Inputs
Receive from orchestrator:
```yaml
projectId: "{projectId}"
changedFiles: []                    # list of changed files
projectKnowledgeContext:             # typed summary-only context
  status: "ready|degraded_read|degraded_write|not_configured|stale"
  strictness: "advisory|required"
  policyAnchors: []
  semanticFacts: []
  graphSynopsis: []
  ontologyConstraints: []
  staleOrUnavailable: []
codeReviewGraph:                    # summary only; never raw graph output
  impactSummary: []
  reviewContextSummary: []
  warnings: []
diff: "{git diff summary}"          # or file path to diff
```

## Workflow

### 0. Source Boundaries
Do not read `.moonshot-relay/docs/ko/` for MemoryGraph review context. Treat it as a human-facing Korean mirror and validate against MemoryGraph plus canonical project policy/spec sources.
Ignore MemoryGraph entries that merely repeat system, developer, `AGENTS.md`, `.claude/rules/**`, or workflow hard rules.

### 1. Reload Relevant Memory
Use MemoryGraph read-only tools to get latest rules for changed files:

```
recall_memories(
  query="rules conventions changed files ${projectId}",
  project_path="{projectPath}",
  limit=20
)

search_memories(tags=["project:{projectId}", "convention"], limit=20)
search_memories(tags=["project:{projectId}", "component:{component-name}"], limit=20)
```

### 2. Check Boundary Violations

#### NeverDo Check (Critical - Halt if violated)
```yaml
check:
  - ".env files committed?" → NeverDo violation
  - "Tests deleted?" → NeverDo violation
  - "Secrets hardcoded?" → NeverDo violation
```

#### AskFirst Check (Requires approval)
```yaml
check:
  - "New dependency added?" → AskFirst item
  - "DB schema changed?" → AskFirst item
  - "Auth logic modified?" → AskFirst item
```

#### AlwaysDo Check (Reminder)
```yaml
check:
  - "Lint run?" → AlwaysDo reminder
  - "Tests passed?" → AlwaysDo reminder
```

### 3. Check Convention Violations
Compare changes against compact `projectKnowledgeContext.policyAnchors`, `semanticFacts`, `graphSynopsis`, and refreshed stage-scoped conventions:
- Naming conventions
- File structure patterns
- Error handling patterns
- API response formats

Use `codeReviewGraph.impactSummary` and `reviewContextSummary` only as auxiliary hints for which changed components, callers, importers, or tests deserve boundary scrutiny. Do not consume raw graph output and do not write code-review-graph data into MemoryGraph.

### 4. Check Component Spec Violations
For changed components, verify:
- Required props
- Expected behavior
- Dependencies

### 5. Generate Violation Report

```yaml
memoryReviewResult:
  status: "passed" | "failed" | "needs_approval"
  stage: "review"

  violations:   # NeverDo violations (critical)
    - rule: "project:{projectId}:boundary:never-do"
      item: "Delete existing tests"
      file: "src/components/Button.test.tsx"
      action: "halt"

  needsApproval:  # AskFirst items
    - rule: "project:{projectId}:boundary:ask-first"
      item: "New dependency added"
      detail: "axios package added to dependencies"
      action: "ask_user"

  warnings:     # Convention/spec warnings
    - rule: "project:{projectId}:convention:naming"
      item: "Component should use PascalCase"
      file: "src/components/myButton.tsx"
      action: "warn"

  reminders:    # AlwaysDo reminders
    - rule: "project:{projectId}:boundary:always-do"
      item: "Run npm run lint before commit"

  passed: true | false
```

## Output
Return `memoryReviewResult` to be merged into `analysisContext`.

## Decision Logic
```
if violations.length > 0:
  return { status: "failed", action: "halt" }

if needsApproval.length > 0:
  return { status: "needs_approval", action: "ask_user" }

return { status: "passed", action: "proceed" }
```

## Error Handling
1. **MemoryGraph unavailable**: Skip check, log warning, proceed
2. **Partial rules loaded**: Check with available rules, note in warnings

## Contract
- Runs in forked session to prevent context pollution
- Returns only violation summary, not full rule contents
- Consumes only typed summary-only project knowledge context, never raw memory contents
- NeverDo violations MUST halt execution
- AskFirst items MUST get user approval before proceeding
- Must update `analysisContext.projectKnowledge.stageCoverage.review` to `checked`, `not_checked`, or `skipped`.

## Project Knowledge Context Contract

`projectKnowledgeContext` is the authoritative prompt-facing contract. It is summary-only and consists of `## Project Knowledge Context`, typed status metadata, policy anchors, semantic facts, graph synopsis, ontology constraints, stale/unavailable entries, and omission categories.

Rules:
- Consume or return only compact summary items and status metadata.
- Treat old `projectMemoryContext` wording as legacy and non-authoritative.
- Never return raw MemoryGraph records, KG edges, ontology dumps, logs, transcripts, or secret-like strings.
- Advisory unavailable state is a degraded warning; strict memory tasks must mark blocking metadata before execution proceeds.
