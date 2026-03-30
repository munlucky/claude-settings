# Meta-Harness Recursive Improvement

> Use this workflow when improving the harness itself without polluting `main` or committing generated experiment outputs.

Last-Reviewed: 2026-03-30

## Goal

Keep the repository split into two states:

- stable reusable harness assets on `main`
- isolated recursive-improvement experiments on a dedicated branch/worktree

The branch is allowed to generate fixtures, logs, scorecards, and temporary repositories, but those outputs must stay ignored and never become part of the promotion set.

## Default Layout

- Stable `main` worktree: repository root
- Recursive branch: `codex/harness-recursive`
- Recursive worktree: `.tmp/harness-worktrees/harness-recursive`
- Candidate branch: `codex/harness-main-candidate`
- Candidate worktree: `.tmp/harness-worktrees/harness-main-candidate`
- Ephemeral run outputs: `.tmp/harness-runs/<run-id>/`
- Optional generated repos: `.tmp/harness-workspaces/<run-id>/`

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

## Candidate Promotion Flow

Promote reusable harness changes from the recursive branch into the isolated candidate worktree with:

```bash
bash .claude/scripts/harness-promote.sh --source codex/harness-recursive
```

The promotion script:

1. Targets `codex/harness-main-candidate` by default.
2. Creates or reuses `.tmp/harness-worktrees/harness-main-candidate`.
3. Resets the whitelisted paths in the candidate worktree back to `main`.
4. Copies only the whitelisted paths from the current source worktree state into the candidate worktree.
5. Runs the strict `meta_harness` verification commands in the candidate worktree.
6. Leaves the verified promotion candidate ready for review and commit on the candidate branch.

The script does not touch `main` unless you explicitly opt in with `--allow-main-target`.

## Explicit Main Update

When the candidate branch has been reviewed and you intentionally want to update `main`, run from the candidate worktree:

```bash
bash .claude/scripts/harness-promote.sh --source codex/harness-main-candidate --target main --target-base main --allow-main-target
```

That step is intentionally explicit because it will modify the `main` worktree.

## Daily Operating Loop

1. Prepare the recursive worktree.
2. Run fixture generation, scoring, and harness experiments only inside ignored paths.
3. Convert successful lessons into reusable `.claude` assets on the recursive branch.
4. Run the promotion script to refresh the isolated candidate worktree.
5. Review and commit on the candidate branch.
6. Update `main` only in a deliberate release step.
7. Normalize harness quality from accumulated real run summaries before claiming the harness is ready.

## Hard Rules

- Do not merge the recursive branch directly into `main`.
- Do not add generated task outputs or logs to `.claude/harness-promotion-paths.txt`.
- Do not target `main` unless you are intentionally releasing candidate changes.
- Do not run promotion into a dirty target worktree.
- Keep the stable branch reviewable by promoting only reusable harness definitions.
