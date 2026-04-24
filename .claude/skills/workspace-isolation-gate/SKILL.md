---
name: workspace-isolation-gate
description: Use before implementation in strict runs to confirm isolated workspace setup and baseline evidence.
---

# Workspace Isolation Gate

## Role
Enforce branch/workspace isolation and baseline evidence before implementation in strict or phase-based runs.

This is the default Ready / Isolate stage gate for strict implementation runs.

## When to use
- Right before the first `implementation-runner`.
- Required when `workflowProfile == strict`.
- Required for phase-based work unless an existing safe execution workspace is already documented.

## Inputs
- `analysisContext.repo.gitBranch`
- `analysisContext.repo.gitStatus`
- `analysisContext.signals.workflowProfile`
- `analysisContext.notes`
- baseline evidence notes or artifacts

## Gate logic
1. If `workflowProfile != strict` and the work is not phase-based: do not block; add note and return.
2. Branch safety check:
   - Block if branch is `main` or `master` unless explicit user approval is recorded in notes.
3. Concrete isolation evidence check:
   - Require branch or worktree identifier.
   - Require `.worktrees` or project-local worktree ignore confirmation when a worktree is used.
   - Require dependency/setup command or explicit "setup not required" note.
   - Require baseline verification command.
   - Require baseline exit code.
   - Require baseline log or artifact path.
4. Dirty state handling:
   - `gitStatus=dirty` is not an automatic failure, but requires an explicit note that current changes are expected.

## Output (patch)
```yaml
signals:
  isolatedWorkspaceReady: true
notes:
  - "workspace-isolation-gate: passed (strict)"
workspaceIsolation:
  branchOrWorktree: ""
  worktreeIgnoreChecked: true
  setupCommand: ""
  baselineCommand: ""
  baselineExitCode: 0
  baselineArtifact: ""
```

Blocked example:
```yaml
phase: planning
signals:
  isolatedWorkspaceReady: false
missingInfo:
  - category: workspace-isolation
    priority: HIGH
    question: "Please record branch/worktree identity, ignore check, setup command, baseline command, exit code, and baseline artifact."
    reason: "Strict or phase-based work requires concrete workspace prepare/baseline evidence before implementation."
notes:
  - "workspace-isolation-gate: blocked (missing isolation evidence)"
```

## Rules
- Do not enforce specific directory paths.
- Enforce isolation invariants and baseline evidence.
- Do not auto-create worktrees in this gate; worktree creation remains a separate pilot candidate.
- If blocked, stop implementation progression.
