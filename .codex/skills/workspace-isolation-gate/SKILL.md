---
name: workspace-isolation-gate
description: Use before implementation in strict runs to confirm isolated workspace setup and baseline evidence.
---

# Workspace Isolation Gate

## Role
Enforce branch/workspace isolation, agent-config hydration, and baseline evidence before implementation in strict or phase-based runs.

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
   - Require `.worktrees` or project-local worktree ignore confirmation when a worktree is used.
   - Require agent config source for downstream worktrees.
   - Require `.claude`, `.agents`, and `.codex` ignore detection results when the target project ignores agent config.
   - Require hydration status proving `.claude/CLAUDE.md`, `.claude/skills`, `.claude/scripts`, `.codex/skills`, and `AGENTS.md` are usable in the worktree.
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
  worktreePathIgnored: true
  agentConfigSource: ""
  ignoredAgentPaths: []
  hydratedAgentConfig: true
  setupCommand: ""
  baselineCommand: ""
  baselineExitCode: 0
  baselineArtifact: ""
  prepareArtifact: ".claude/worktree-prepare.json"
```

Blocked example:
```yaml
phase: planning
signals:
  isolatedWorkspaceReady: false
missingInfo:
  - category: workspace-isolation
    priority: HIGH
    question: "Please record branch/worktree identity, agent config source, ignore detection, hydration status, setup command, baseline command, exit code, and baseline artifact."
    reason: "Strict or phase-based work requires a worktree where the agent harness is actually usable before implementation."
notes:
  - "workspace-isolation-gate: blocked (missing isolation evidence)"
```

## Rules
- Do not enforce specific directory paths.
- Enforce isolation invariants and baseline evidence.
- Prefer `bash .claude/scripts/harness-prepare-worktree.sh <task-id> --hydrate-agent-config --baseline-command "<cmd>"` when a fresh worktree is required.
- Do not copy `.claude/logs`, `.claude/cache`, `.claude/memory.json`, `.claude/memorygraph/`, `.codex/auth.json`, or runtime verdict/cache state into a worktree.
- Treat harness repo work and downstream product work differently: harness repo work may rely on tracked `.claude` source, while downstream work usually needs ignored agent-config hydration.
- If blocked, stop implementation progression.
