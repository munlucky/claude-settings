# Phase 01 - Git-Safe Child Process v1

## Purpose

Centralize active Git child-process calls so tests and scripts tolerate dubious ownership and apply consistent `safe.directory` handling.

## Execution Metadata

```yaml
phase: 01
title: Git-Safe Child Process
dependsOn: []
conflictsWith: []
ownedPaths:
  - scripts/lib/git-safe.mjs
  - scripts/project-identity.mjs
  - scripts/prepare-phase-runner-state.mjs
  - scripts/verification-verdict-state.mjs
  - tests/git-safe-contract.test.mjs
  - tests/package-layout.test.mjs
  - tests/package-materialization.test.mjs
readOnlyPaths:
  - archive/**
  - .claude/**
  - .codex/**
  - .moonshot-relay/**
sharedMutablePaths:
  - tests/package-layout.test.mjs
  - tests/package-materialization.test.mjs
adoptionTargets: []
liveMutationPolicy: source_only
```

## Implementation Contract

Add `scripts/lib/git-safe.mjs` with these named exports:

- `gitSafeArgs(repoRoot, args)` returns `['-c', 'safe.directory=<absRepoRoot>', ...args]`.
- `runGit(repoRoot, args, options = {})` uses `spawnSync('git', gitSafeArgs(repoRoot, args), { cwd: repoRoot, encoding: 'utf8', ...options })`.
- `gitLsFiles(repoRoot, pathspecs = [])` calls `runGit(repoRoot, ['ls-files', '--', ...pathspecs])`.
- `gitStatusBranchLine(repoRoot)` returns the first line from `git status --short --branch`, or `''` on failure.
- `gitConfigValue(repoRoot, key)` returns trimmed config output or `''` on failure.
- `gitCurrentBranch(repoRoot)` returns trimmed branch output or `''` on failure.

Refactor active direct Git callers:

- `scripts/project-identity.mjs` must use `gitConfigValue()` and `gitCurrentBranch()`.
- `scripts/prepare-phase-runner-state.mjs` must use `gitStatusBranchLine()`.
- `scripts/verification-verdict-state.mjs` must use `runGit(candidate, ['-c', 'core.editor=true', 'rev-parse', 'HEAD^{tree}'])`.
- `tests/package-layout.test.mjs` and `tests/package-materialization.test.mjs` must use `gitLsFiles()`.

Only `scripts/lib/git-safe.mjs` may directly spawn `git` outside `archive/**`.

## Acceptance Criteria

- Git helper API exists with the named exports above.
- Active scripts/tests no longer call `spawnSync('git')`, `execFileSync('git')`, or `execSync('git')` directly outside `scripts/lib/git-safe.mjs`.
- `gitLsFiles()` uses `--` before pathspecs.
- Existing fallback behavior in `project-identity.mjs` remains intact when Git is unavailable.

## Verification

```powershell
node --test tests/git-safe-contract.test.mjs tests/package-layout.test.mjs tests/package-materialization.test.mjs
rg -n "spawnSync\('git'|execFileSync\('git'|execSync\('git'" scripts tests package bin tools
npm run test:package
```

The `rg` command must show only `scripts/lib/git-safe.mjs` outside `archive/**`.
