---
name: workspace-isolation-gate
description: Strict workflow gate that ensures implementation runs in an isolated branch/workspace with a verified baseline.
---

# Workspace Isolation Gate

## Role
Enforce branch/workspace isolation before implementation in strict mode.

## When to use
- Right before the first `implementation-runner`.
- Required when `workflowProfile == strict`.

## Inputs
- `analysisContext.repo.gitBranch`
- `analysisContext.repo.gitStatus`
- `analysisContext.signals.workflowProfile`
- `analysisContext.notes`

## Gate logic
1. If `workflowProfile != strict`: do not block; add note and return.
2. Branch safety check:
   - Block if branch is `main` or `master` unless explicit user approval is recorded in notes.
3. Isolation evidence check (non-path-specific):
   - Require at least one note indicating isolated setup or baseline verification, for example:
     - `"worktree-ready"` / `"isolated-workspace-ready"`
     - `"baseline-tests-pass"` / `"baseline-verified"`
4. Dirty state handling:
   - `gitStatus=dirty` is not an automatic failure, but requires an explicit note that current changes are expected.

## Output (patch)
```yaml
signals:
  isolatedWorkspaceReady: true
notes:
  - "workspace-isolation-gate: passed (strict)"
```

Blocked example:
```yaml
phase: planning
signals:
  isolatedWorkspaceReady: false
missingInfo:
  - category: workspace-isolation
    priority: HIGH
    question: "Please confirm isolated branch/workspace setup and clean baseline evidence."
    reason: "Strict profile requires isolation before implementation."
notes:
  - "workspace-isolation-gate: blocked (missing isolation evidence)"
```

## Rules
- Do not enforce specific directory paths.
- Enforce isolation invariants only (branch safety + baseline evidence).
- If blocked, stop implementation progression.
