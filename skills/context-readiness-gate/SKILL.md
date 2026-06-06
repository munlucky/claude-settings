---
name: context-readiness-gate
description: Checks whether a downstream task has the minimum context contract and routes to context-builder when it does not.
---

# Context Readiness Gate

## Role
Prevent downstream implementation from starting without a minimal `context.md`.

## When to use
- `executionPlane == product_project`
- Before `implementation-runner`

## Inputs
- `analysisContext.signals.executionPlane`
- `analysisContext.signals.contextReady`
- `analysisContext.artifacts.contextDocPath`

## Minimum Context Sections
- `Goal`
- `Constraints`
- `Acceptance Criteria`
- `Out of Scope`
- `Target Files`
- `Verification Plan`

## Gate logic
1. If `executionPlane != product_project`, pass with note.
2. If `contextReady == true`, pass.
3. Otherwise:
   - keep the workflow in planning
   - recommend or auto-insert `context-builder`
   - record which minimum sections are missing

## Output (patch)
```yaml
notes:
  - "context-readiness-gate: blocked -> run context-builder"
missingInfo:
  - category: task-context
    priority: HIGH
    question: "Generate `{tasksRoot}/{feature-name}/context.md` with the minimum context schema."
decisions:
  recommendedAgents:
    - context-builder
```

## Rules
- This gate is policy-only.
- Read `docs/public/guidelines/context-readiness-schema.md` for the exact section contract.
