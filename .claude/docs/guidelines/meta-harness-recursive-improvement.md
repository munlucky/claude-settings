# Meta-Harness Recursive Improvement

> Use this workflow when improving the harness itself without polluting `main` or committing generated experiment outputs.

Last-Reviewed: 2026-03-30

## Goal

Keep the repository split into two daily states:

- stable reusable harness assets on `main`
- isolated recursive-improvement experiments on a dedicated recursive branch/worktree

The branch is allowed to generate fixtures, logs, scorecards, and temporary repositories, but those outputs must stay ignored and never become part of the promotion set.

## Default Layout

- Stable `main` worktree: repository root
- Recursive branch: `codex/harness-recursive`
- Recursive worktree: `.tmp/harness-worktrees/harness-recursive`
- Ephemeral run outputs: `.tmp/harness-runs/<run-id>/`
- Optional generated repos: `.tmp/harness-workspaces/<run-id>/`
- Optional temporary release candidate: create only when a separate release-review sandbox is useful

## Tracked vs Ignored

Tracked:

- reusable `.claude` assets
- `.claudeignore`
- `.gitignore`
- verification fixtures and reference plans that are intentionally part of the harness

Ignored:

- temporary worktrees
- generated repos or copied fixtures
- logs, verdict JSON, score snapshots, and other run outputs
- harness quality run summaries under `.tmp/harness-runs/**/harness-quality-run.json`
- any artifact that exists only to test the harness rather than define it

The promotion source of truth is `.claude/harness-promotion-paths.txt`.

## Worktree Preparation

Prepare or reuse the default recursive worktree with:

```bash
bash .claude/scripts/harness-prepare-recursive-worktree.sh
```

Default behavior:

1. Reuses `.tmp/harness-worktrees/harness-recursive` when it already exists.
2. Otherwise creates branch `codex/harness-recursive` from `main`.
3. Prints the worktree path you should use for experiments.

Environment overrides:

- `HARNESS_RECURSIVE_BRANCH`
- `HARNESS_RECURSIVE_WORKTREE`
- `HARNESS_RECURSIVE_BASE_BRANCH`

## Optional Temporary Release Candidate

When you want an isolated release-review sandbox without touching the `main` worktree, create a temporary target explicitly:

```bash
bash .claude/scripts/harness-promote.sh --source codex/harness-recursive --target codex/harness-release-candidate --target-base main --target-worktree .tmp/harness-worktrees/harness-release-candidate
```

The promotion script:

1. Requires an explicit target branch.
2. Creates or reuses the requested target worktree only when you ask for it.
3. Resets the whitelisted paths in that target worktree back to `main`.
4. Copies only the whitelisted paths from the current source worktree state.
5. Runs the strict `meta_harness` verification commands in the target worktree.

This temporary candidate is optional. It is not part of the default daily loop.

## Explicit Main Update

For normal day-to-day operation, keep only `main` and the recursive worktree open.

When you intentionally release to `main`, use a selective path update from the recursive branch or from a temporary release-candidate worktree. Do not merge the recursive branch directly into `main`.

## Daily Operating Loop

1. Prepare the recursive worktree.
2. Write `IMPLEMENTATION_TEST_BRIEF.md` and `RUN_MANIFEST.md` for each real implementation test before touching code.
3. Run fixture generation, scoring, and harness experiments only inside ignored paths.
4. Convert successful lessons into reusable `.claude` assets on the recursive branch.
5. Review and commit on the recursive branch.
6. Only when needed, create a temporary release-candidate worktree for isolated release review.
7. Update `main` only in a deliberate selective release step.
8. Normalize harness quality from accumulated real run summaries before claiming the harness is ready.

## Hard Rules

- Do not merge the recursive branch directly into `main`.
- Do not add generated task outputs or logs to `.claude/harness-promotion-paths.txt`.
- Do not target `main` unless you are intentionally releasing recursive changes.
- Do not run promotion into a dirty target worktree.
- Keep the stable branch reviewable by promoting only reusable harness definitions.
