# External Harness Pilot Registry

Last-Reviewed: 2026-04-24

Decision values:
- `adopt`: use the local pattern as a hard rule now
- `adapt`: transfer the strategy into local skills/templates
- `reject`: do not use in the default flow
- `defer`: keep as a later pilot or regression-plane candidate

Sandbox root:

```text
.tmp/external-skill-pilots/skills-sh/
```

Pilot command:

```bash
node .claude/scripts/external-skills-pilot.mjs
node .claude/scripts/external-skills-pilot.mjs --run-install
node .claude/scripts/external-skills-pilot.mjs --run-install --max-install-candidates 2 --install-timeout-ms 20000
```

Result artifacts:

- `.tmp/external-skill-pilots/skills-sh/manifest.json`
- `docs/claude-tasks/external-harness-adoption/pilot-results.md`
- `docs/claude-tasks/external-harness-adoption/pilot-results.ko.md`

## Tier A: Immediate Pilot / Local Gap Review

| Candidate | Source Type | Decision | Local Target | Pilot Status | Notes |
|---|---|---|---|---|---|
| `jwynia/agent-skills:requirements-analysis` | skill pattern | adapt | `product-orchestrator`, `moonshot-plan-writer`, `task-slicer` | sandbox registered | Recheck problem/non-goal/acceptance/constraint coverage. |
| `jwynia/agent-skills:system-design` | skill pattern | adapt | `product-orchestrator`, `moonshot-plan-writer`, design gates | sandbox registered | Recheck walking skeleton, ADR, rollback strategy. |
| `obra/superpowers:brainstorming` | skill pattern | adapt | `product-orchestrator`, `task-slicer` | sandbox registered | Use only as intake/design support, not a public entrypoint. |
| `obra/superpowers:writing-plans` | skill pattern | adapt | `moonshot-plan-writer`, `codex-validate-plan`, `SPRINT_CONTRACT` | local pattern implemented; external comparison pending | Exact files/commands/signals required. |
| `obra/superpowers:using-git-worktrees` | skill pattern | adapt | `workspace-isolation-gate`, `harness-prepare-worktree` | local runtime implemented; external comparison pending | Concrete baseline and agent-config hydration evidence required. |
| `obra/superpowers:executing-plans` | skill pattern | adapt | `codex-validate-plan`, `implementation-runner` | local pattern implemented; external comparison pending | Reject abstract plans without exact execution targets. |
| `obra/superpowers:requesting-code-review` | skill pattern | adapt | `codex-review-code`, `QA_REPORT` | sandbox registered | Review request payload and cadence. |
| `obra/superpowers:receiving-code-review` | skill pattern | adapt | `codex-review-code`, `QA_REPORT` | sandbox registered | Accepted/challenged/deferred findings discipline. |
| `obra/superpowers:verification-before-completion` | skill pattern | adopt | `completion-verifier`, `verification-evidence-gate`, completion gate | local pattern implemented; external comparison pending | Fresh evidence required before completion. |
| `obra/superpowers:finishing-a-development-branch` | skill pattern | adapt | `commit-moonshot`, `session-logger`, `HANDOFF` | sandbox registered | Connect finish decisions to clean finish/retry/resume handoff. |
| `obra/superpowers:test-driven-development` | skill pattern | adopt | `test-driven-development`, `SPRINT_CONTRACT`, `QA_REPORT` | local pattern implemented; external comparison pending | Required for behavior-changing work unless explicitly bypassed. |
| `obra/superpowers:systematic-debugging` | skill pattern | adopt | `failure-analyzer`, `build-error-resolver`, recovery bundle | local pattern implemented; external comparison pending | Root-cause evidence before fix; same failure class forces tactic change. |

## Tier B: Parallel/Team Execution and Skill Quality

| Candidate | Source Type | Decision | Local Target | Pilot Status | Notes |
|---|---|---|---|---|---|
| `obra/superpowers:subagent-driven-development` | skill pattern | defer | `moonshot-teams-runner`, phase execution profiles | sandbox registered | Compare against existing teams runner before adoption. |
| `obra/superpowers:dispatching-parallel-agents` | skill pattern | defer | `moonshot-teams-runner`, team coordination | sandbox registered | Use only if it improves current parallel execution evidence. |
| `obra/superpowers:writing-skills` | skill pattern | defer | skill metadata lint candidate | sandbox registered | Candidate for future skill authoring rules. |
| `obra/superpowers:using-superpowers` | skill pattern | defer | skill selection discipline candidate | sandbox registered | Meta discipline only; avoid widening public surface. |
| `skills.sh find-skills` | CLI behavior | defer | external discovery workflow | sandbox registered | Use for discovery only, not default runtime. |
| `callstackincubator/agent-skills:validate-skills` | skill quality | defer | skill metadata verifier candidate | sandbox registered | Candidate for metadata lint after source review. |

## Tier C: Pattern Borrowing / Limited Pilot

| Candidate | Source Type | Decision | Local Target | Pilot Status | Notes |
|---|---|---|---|---|---|
| `planning-with-files` | skill pattern | adapt | tasks/progress/findings pattern only | sandbox registered | Pattern already partially absorbed; hooks require review. |
| `notedit/happy-skills:feature-dev` | broad skill | defer | feature-dev comparison only | sandbox registered | Too broad for default path; useful as comparison corpus. |
| `open-horizon-labs/skills:review` | review pattern | defer | review rubric comparison only | sandbox registered | Compare with `codex-review-code`. |

## Tier D: Default Path Reject

| Candidate | Source Type | Decision | Local Target | Pilot Status | Notes |
|---|---|---|---|---|---|
| Bulk `skills.sh` installation | installer behavior | reject | none | rejected for default flow | Too much overlap with local skills and public-surface diet. |
| Unreviewed hook/shell/network skills | security behavior | reject | none | rejected for default flow | Requires security review before allowlist. |
| External skill as direct public entrypoint | surface behavior | reject | none | rejected for default flow | Public entrypoint count must remain stable. |

## External Harness / Eval Plane

| Candidate | Source Type | Decision | Local Target | Pilot Status | Notes |
|---|---|---|---|---|---|
| SWE-bench scoring model | harness concept | adapt | `SCORECARD`, `render-scorecard.py`, completion gate | local vocabulary and gate implemented | Use `FULL / PARTIAL / NO` conceptually; no SWE-bench runtime import. |
| Terminal-Bench / Harbor | benchmark harness | defer | external regression plane export | export adapter added | See `eval-plane-integration.md`. |
| OpenAI Evals | eval framework | defer | docs/agent-output rubric export | export adapter added | See `eval-plane-integration.md`. |
| Inspect AI | eval framework | defer | formal evaluation manifest export | export adapter added | See `eval-plane-integration.md`. |

## Pilot Safety Rules

- Use sandbox/pilot directories, not production `.claude/skills`.
- Review hook/shell/network behavior before allowlisting.
- Record evidence before changing local contracts.
- Prefer adapting the checklist or strategy into local assets.
