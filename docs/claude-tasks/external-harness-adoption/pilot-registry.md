# External Harness Pilot Registry

Last-Reviewed: 2026-04-24

Decision values:
- `adopt`: use the local pattern as a hard rule now
- `adapt`: transfer the strategy into local skills/templates
- `reject`: do not use in the default flow
- `defer`: keep as a later pilot or regression-plane candidate

| Candidate | Source Type | Decision | Local Target | Pilot Status | Notes |
|---|---|---|---|---|---|
| `test-driven-development` | skill pattern | adopt | `test-driven-development`, `SPRINT_CONTRACT`, `QA_REPORT` | local pattern implemented | Required for behavior-changing work unless explicitly bypassed. |
| `systematic-debugging` | skill pattern | adopt | `failure-analyzer`, `build-error-resolver`, recovery bundle | local pattern implemented | Root-cause evidence before fix; same failure class forces tactic change. |
| `using-git-worktrees` | skill pattern | adapt | `workspace-isolation-gate`, `harness-prepare-worktree` | local runtime implemented | Concrete baseline evidence required; ignored `.claude/.agents/.codex` hydration supported. |
| `writing-plans` | skill pattern | adapt | `moonshot-plan-writer`, `task-slicer` | local contract strengthened | Exact files/commands/signals required. |
| `executing-plans` | skill pattern | adapt | `codex-validate-plan`, `implementation-bundle` | local contract strengthened | Reject abstract plans without exact execution targets. |
| SWE-bench scoring model | harness concept | adapt | `SCORECARD`, `render-scorecard.py` | local vocabulary implemented | Use `FULL / PARTIAL / NO` conceptually; no SWE-bench runtime import. |
| Terminal-Bench / Harbor | benchmark harness | defer | external regression plane | not started | Candidate after local task corpus exists. |
| OpenAI Evals | eval framework | defer | docs/agent-output evaluation | not started | Candidate for PR notes, runbooks, and agent output rubrics. |
| Inspect AI | eval framework | defer | formal evaluation plane | not started | Candidate after internal scenarios stabilize. |
| Bulk `skills.sh` installation | installer behavior | reject | none | rejected for default flow | Too much overlap with local skills and public-surface diet. |

## Pilot Safety Rules

- Use sandbox/pilot directories, not production `.claude/skills`.
- Review hook/shell/network behavior before allowlisting.
- Record evidence before changing local contracts.
- Prefer adapting the checklist or strategy into local assets.
