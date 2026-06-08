---
name: workspace-isolation-gate
description: Use before implementation in strict runs to confirm isolated workspace setup and baseline evidence.
---

# Workspace Isolation Gate

## Role
Validate minimum machine-checkable workspace isolation evidence before implementation in strict or phase-based runs.

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
- worktree prepare evidence notes or artifacts

## Gate logic
1. If `workflowProfile != strict` and the work is not phase-based: do not block; add note and return.
2. Branch safety check:
   - Block if branch is `main` or `master` unless explicit user approval is recorded in notes.
3. Concrete isolation evidence check:
   - Require branch or worktree identifier.
   - Require prepare artifact path or explicit existing-workspace evidence.
   - Require hydration status.
   - Require baseline verification command.
   - Require baseline exit code.
   - Require sandbox policy status.
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
  prepareArtifact: ".claude/worktree-prepare.json"
  hydrationStatus: ready | degraded | not_required
  baselineCommand: ""
  baselineExitCode: 0
  sandboxPolicyStatus: allowed | warning | blocked | not_checked
```

Blocked example:
```yaml
phase: planning
signals:
  isolatedWorkspaceReady: false
missingInfo:
  - category: workspace-isolation
    priority: HIGH
    question: "Please record branch/worktree identity, prepare artifact, hydration status, baseline command, baseline exit code, and sandbox policy status."
    reason: "Strict or phase-based work requires machine-checkable isolation evidence before implementation."
notes:
  - "workspace-isolation-gate: blocked (missing isolation evidence)"
```

## Rules
- Do not enforce specific directory paths.
- Enforce isolation invariants and baseline evidence.
- Store detailed ignore checks, setup commands, and baseline logs inside the prepare artifact when available; do not require every detail at prompt level.
- Prefer the installed worktree preparation entrypoint when a fresh worktree is required; if it is unavailable, record manual hydration evidence for the same invariants.
- Do not copy `.claude/logs`, `.claude/cache`, `.claude/memory.json`, `.claude/memorygraph/`, `.codex/auth.json`, or runtime verdict/cache state into a worktree.
- Treat harness repo work and downstream product work differently: harness repo work may rely on tracked `.claude` source, while downstream work usually needs ignored agent-config hydration.
- Treat leased worktree escape, generated-state promotion into source, runtime DB/verdict package inclusion, and unauthorized account-root mutation as sandbox violations that block clean completion.
- Use `<MOONSHOT_RELAY_HOME>/tools/sandbox/policy.mjs check --json` or the source checkout equivalent to classify protected paths and approval-required operations when runtime-state is available.
- Sandbox artifacts belong under leased disposable roots and must not be promoted into source or package payloads.
- If blocked, stop implementation progression.
