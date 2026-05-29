# Worktree Classification

Captured command: `git status --short --branch`

Captured branch state: `main...origin/main [behind 1]`

| Path | Status | Classification | Owner | Allowed Action | Blocks Later Phases |
|---|---|---|---|---|---|
| `.claude/CLAUDE.md` | `M` | `baseline` | current harness redesign planning workstream | Preserve as current local harness context; do not revert during runner preparation | no |
| `.claude/docs/guidelines/skill-composition.ko.md` | `M` | `baseline` | current harness redesign planning workstream | Preserve as current local harness context; do not revert during runner preparation | no |
| `.claude/docs/guidelines/skill-composition.md` | `M` | `baseline` | current harness redesign planning workstream | Preserve as current local harness context; do not revert during runner preparation | no |
| `.claude/skills/moonshot-harness-maintainer/SKILL.md` | `M` | `baseline` | current harness redesign planning workstream | Preserve as current local harness context; do not revert during runner preparation | no |
| `.claude/verification.contract.yaml` | `M` | `baseline` | current harness redesign planning workstream | Preserve as current local harness context; do not revert during runner preparation | no |
| `.codex/skills/moonshot-harness-maintainer/SKILL.md` | `M` | `baseline` | current harness redesign planning workstream | Preserve as current local harness context; do not revert during runner preparation | no |
| `.claude/scripts/harness-bottleneck-audit.mjs` | `??` | `baseline` | current harness redesign planning workstream | Preserve as current audit tooling; do not revert during runner preparation | no |
| `.claude/scripts/harness-bottleneck-audit.test.mjs` | `??` | `baseline` | current harness redesign planning workstream | Preserve as current audit tooling; do not revert during runner preparation | no |
| `docs/implementation/harness-workflow-core-redesign-2026-05-29/` | `??` | `draft` | current harness redesign planning workstream | Use as selected plan package for phase-runner preparation | no |

No `unknown` dirty path remains.

Upstream note: the branch is behind `origin/main` by 1 commit. This does not block local runner preparation, but it must be handled before final git closeout if the run reaches commit/push closure.
