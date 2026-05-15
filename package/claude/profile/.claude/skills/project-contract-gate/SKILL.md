---
name: project-contract-gate
description: Checks whether a downstream project has a usable PROJECT.md contract and routes to project-md-refresh when it does not.
---

# Project Contract Gate

## Role
Guard downstream implementation flows from entering code work without a minimally usable `.claude/PROJECT.md`.

## When to use
- `executionPlane == product_project`
- Before planning or implementation steps

## Inputs
- `analysisContext.signals.executionPlane`
- `analysisContext.signals.projectContractReady`
- `.claude/PROJECT.md` when present

## Gate logic
1. If `executionPlane != product_project`, return pass with note.
2. If `projectContractReady == true`, return pass.
3. Otherwise:
   - recommend or auto-insert `project-md-refresh`
   - keep phase in planning
   - record which minimum sections are missing

## Minimum Contract Areas
- Project overview
- Commands
- Testing rules
- Structure/patterns
- Git workflow
- Core rules / boundaries

## Output (patch)
```yaml
notes:
  - "project-contract-gate: blocked -> run project-md-refresh"
missingInfo:
  - category: project-contract
    priority: HIGH
    question: "Refresh `.claude/PROJECT.md` before continuing."
decisions:
  recommendedAgents:
    - project-md-refresh
```

## Rules
- This gate is policy-only.
- Do not edit files directly.
- Use `project-md-refresh` as the generator instead of duplicating its behavior.
